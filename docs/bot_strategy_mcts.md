# Bot AI: MCTS стратегия (Easy/Medium/Hard через глубину и бюджет)

## Цель
- Сделать бота заметно умнее без “простого шума” в прицеливании.
- Разные уровни сложности должны отличаться **качеством решений** (глубина/бюджет поиска), а не только погрешностью.
- Решение должно работать в реальном времени (в пределах `planSeconds`) и выполняться в WebWorker.

## Ограничения и контекст движка
- Игра пошаговая, но мир стохастичен (ветер, микрослучайность spread, столкновения гранаты).
- Полная физическая симуляция хода в дереве поиска слишком дорога.
- Нужен “быстрый forward model” (аппроксимация исхода действия), при этом:
  - траектории/коллизии должны быть максимально согласованы с runtime (иначе hard AI будет “читать воздух”).

## Ключевая идея
Используем **MCTS (Monte‑Carlo Tree Search)** с:
- **Progressive widening** (постепенно расширяем непрерывные действия: угол/сила/позиция),
- **Action abstraction** (действия уровня хода: `MoveTo(x)` + `Shot(weapon, angle, power, fuse)`),
- **Гибридной 2‑ply логикой**: в части узлов моделируем ответ противника (мы → противник), но включаем её “смешанно” (по бюджету и по ситуации).

## Архитектура модулей (target)
- `src/ai/mcts/`
  - `MctsTypes.ts` — типы узлов/действий/контекста
  - `ActionGenerator.ts` — генерация действий (move/shot) + progressive widening
  - `ForwardModel.ts` — быстрое применение действия (approx outcome)
  - `Evaluator.ts` — оценка состояния (utility)
  - `MctsPlanner.ts` — UCT/P‑UCT, rollout, budget loop
  - `DifficultyBudgets.ts` — профили easy/medium/hard

Интеграция:
- Worker вызывает `planWithMcts(...)`, и возвращает `plan` в формате совместимом с текущим `BotTurnController` (moveTo + action).
- Текущая эвристика (`chooseBotPlan`) остаётся как fallback (если MCTS не успел/не нашёл валидный ход).

## Представление состояния (search state)
Состояние хранится в “сжатом” виде, достаточном для оценки и риска:
- Позиции/HP всех червей (минимально: `x,y,health,team,width,height`)
- Кто ходит (shooterId/team)
- Ветер/гравитация
- Кулдауны оружия для shooter
- Боекомплект команд (например, гранаты)
- Ссылка на `TerrainQuery` (как сейчас для AI симуляции)

Террейн мы **не мутируем** в поиске в полном виде. Для crater‑эффектов используем:
- либо “локальную аппроксимацию” (штраф за self‑dig при опасности),
- либо флаг “terrainChanged” только для оценки рисков (в v1 можно вообще не учитывать crater в дереве).

## Пространство действий (action abstraction)
### A) Move actions
`MoveTo(x)`:
- кандидаты `x` берём из существующего surface planner (вокруг shooter.x + эвристики выхода из ям/питов),
- ограничиваем top‑K по стоимости/достижимости.

Результат `MoveTo` в forward model:
- меняем позицию shooter на `(x, surfaceY(x))` (без точной анимации),
- добавляем “стоимость хода” (movePenalty), учитываем риск (плохая openness/низкая высота/близость к краю/к врагу).

### B) Shot actions
`Shot` включает:
- `weaponId`
- `angle` (глобальный)
- `power`
- `fuseSeconds` (только для grenade)

Кандидаты shot генерируются из текущего `chooseBotActionScored`, но в форме:
- сначала top‑N “хороших” вариантов (N зависит от difficulty),
- дальше progressive widening добавляет новые (чуть меняем угол/силу вокруг best, + добавляем альтернативное оружие/цель).

## Forward model (быстрое применение действия)
Точность forward model критична. Для v1 используем:

### Trajectory
- Для projectile/grenade/homing — `simulateTrajectory(...)` (как сейчас).
- Для hitscan — raycast по террейну до range.

### Damage model
- В точке взрыва считаем урон всем червям по радиусу (как runtime `explodeAt`, но без дорогих эффектов).
- Гарантия: если `dist <= radius + playerRadius` → минимум 1 HP.

### Friendly fire / self risk
- Self damage — hard‑фильтр (запрещаем).
- Friendly damage:
  - easy/medium: soft‑penalty
  - hard: ближе к hard‑filter (или большой penalty)

### Shot memory
- Используем существующую “память выстрелов” как penalty в utility, чтобы не повторять неэффективные варианты.

## Evaluator (utility функции)
Utility кодирует цель “победа/выживание”, а не только “макс урона”:
- `U = wDamage * (expectedEnemyDamage - expectedFriendlyDamage) + wKill * killBonus`
- позиционные термины:
  - openness/line‑of‑fire
  - близость к краю/яме
  - дистанция до ближайшего врага (штраф за опасную близость, если мы не добиваем)
- ресурсные термины:
  - штраф за расход гранаты при лимите
  - штраф за “неустойчивую гранату” (не robust по ветру)

## MCTS цикл
### Selection
UCT (или P‑UCT) по детям:
- `score = Q/N + c * sqrt(log(N_parent)/N_child)`

### Expansion
Progressive widening:
- число доступных действий растёт с числом посещений узла:
  - `allowedActions = base + k * sqrt(visits)`

### Simulation (rollout)
Rollout policy:
- easy: 1 шаг (greedy оценка после 1 действия)
- medium: 1–2 шага (move→shot)
- hard: 2 шага чаще + иногда ответ противника

### Backprop
Обновляем `N`, `W`, `Q` по utility.

## Гибридный 2‑ply (мы → противник)
2‑ply включаем смешанно:
- по триггерам (low HP / потенциальный kill / close combat),
- и по бюджету (если осталось достаточно итераций).

Модель ответа противника:
- быстрый “greedy shot” через текущий `chooseBotActionScored` (v1),
- опционально mini‑MCTS с маленьким бюджетом (v2).

## Difficulty: профили бюджета
Сложность определяет:
- budget iterations
- maxDepth / rolloutDepth
- размер action space (top‑K moves, top‑N shots)
- частоту включения 2‑ply

Стартовые значения (подгоняются по AIVAI логам):
- easy:
  - 120–250 итераций
  - maxDepth=1
  - topMoves=4, topShots=10
  - 2‑ply: почти никогда
- medium:
  - 400–900 итераций
  - maxDepth=2
  - topMoves=6, topShots=18
  - 2‑ply: по триггерам
- hard:
  - 1200–2800 итераций
  - maxDepth=2, иногда 3
  - topMoves=8, topShots=28
  - 2‑ply: по триггерам и по оставшемуся бюджету

## Интеграция в текущий runtime
### Worker
- `BotThinkWorker` получает snapshot мира и difficulty и вызывает MCTS планер.
- Планер возвращает:
  - `moveTo?: { x, y, allowRope }`
  - `action?: { weaponId, aimAngle, power, fuseSeconds?, targetId? }`

### Совместимость
- Если MCTS не дал валидного действия → fallback на текущий `chooseBotPlan`.
- Если симуляция слишком дорогая → уменьшаем action space через progressive widening.

## Метрики качества
Через `aivai` и логи:
- winrate hard vs medium/easy
- средний урон/ход и число “пустых ходов”
- friendly‑fire события
- расход гранат на урон
