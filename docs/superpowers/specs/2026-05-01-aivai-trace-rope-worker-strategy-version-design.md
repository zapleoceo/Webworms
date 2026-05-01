# AIVAI Trace + Rope Usage + Worker Thinking + Strategy Versioning — Design

## Scope
Добавить в AIVAI-логи:
- движение (moveStrategy) и попытки rope (ropeAttempt),
- отметку, где считался ход (local main / web worker),
- версию стратегии `AI_V=...` в лог и в админке.
Провести исследование баланса оружия через expectedDamage vs realDamage.

## Current Observations
- В AIVAI логах есть `bot_decision` только для стадий выстрела (plan/execute/reserve/dig), но нет детальной телеметрии по движению.
- Rope в коде используется как инструмент достижения `moveTo` (в `executeMovement`), а если план не создаёт `moveTo`, rope никогда не рассматривается.
- Нужна видимость: когда бот “стоял”, он мог реально пытаться walk/jump, но мы этого не видим.

## Goals
- Диагностика “почему стоял/почему не rope/почему упёрся” по одному JSON логу без видеозаписи.
- Rope становится эффективным инструментом перемещения (видно по логам).
- Версионность стратегии отображается в админке и логах, чтобы исключить путаницу “какая логика сейчас играет”.
- Баланс оружия: измерить, какие оружия дают ожидаемый и реальный профит, и где scoring/статы требуют правки.
- Подготовить основу для распараллеливания “думания” в браузере (Web Worker), с отметкой источника решения в логах.

## Non-goals
- Перенос AI на Cloudflare Workers (latency + лимиты + сложность snapshot’ов).
- Полный ребилд физики и карты.

## Design

### 1) Strategy versioning
Единая константа:
- `export const AI_V = "2026-05-01.1";`
Расположение:
- `src/ai/AIVersion.ts` (или рядом с BotAI), чтобы импортировать в:
  - `BotTurnController` (для логов),
  - админку (для отображения),
  - AIVAI uploader (добавить в payload).
Поведение:
- В каждый `bot_decision` добавлять поле `aiV`.
- В корневой объект AIVAI лога добавить `aiV`.
- В админке во вкладке BOT показывать `Bot (AI_V=2026-05-01.1)` рядом с заголовком.

### 2) AIVAI trace расширение: движение и rope
Добавить новые события (в `aivaiLog.events`), которые пишутся только в режиме `aivai`:

**2.1 bot_move_strategy**
- Когда: при выборе стратегии движения в `BotTurnController.selectStrategy` и при смене/бане стратегии.
- Поля:
  - `type: "bot_move_strategy"`
  - `t`, `team`, `wormId`
  - `strategy` (walk/jump/rope_climb/rope_swing/rope_descend)
  - `why`: { `needUp`, `needDown`, `gap`, `obstacle`, `ceilingLow`, `ropeRemaining` }
  - `moveTo`: {x,y} если есть
  - `bannedTurn`: string[]
  - `aiV`
  - `thinkSrc`: "main" | "worker" (см. секцию 4)

**2.2 bot_rope_attempt**
- Когда: на каждом `tryAttachRope` перед попыткой и после результата.
- Поля:
  - `type: "bot_rope_attempt"`
  - `t`, `team`, `wormId`
  - `strategy` (rope_climb/swing/descend)
  - `result`: "no_rope" | "budget" | "cooldown" | "dx_small" | "no_anchor" | "fired" | "attached"
  - `anglesTried`: number (сколько углов рассмотрели)
  - `bestScore`: number|null
  - `anchor`: {x,y,dist} если найден
  - `aiV`, `thinkSrc`

**2.3 bot_movement_summary**
- Когда: при выходе из фазы movement (перед выстрелом execute_fire).
- Поля:
  - `type: "bot_movement_summary"`
  - `t`, `team`, `wormId`
  - `moveElapsed`
  - `stuckTime`
  - `didReplan`: boolean
  - `aiV`, `thinkSrc`

Ограничение объёма:
- писать только при смене стратегии/попытке rope/ре-плане/подозрении stuck.
- не логировать каждый тик.

### 3) Rope becomes “desirable”
Проблема архитектурная: rope сейчас включается только если у плана есть `moveTo`.
Решение (итеративно, без полной переработки AI):
- В `chooseBotPlan` (planner) добавить эвристику:
  - если shot candidates имеют низкий expectedDamage и/или высокий miss, а впереди obstacle/gap/short cliff — сгенерировать `moveTo` точку “после rope/спуска”:
    - для gap: moveTo.x += 140..220 в сторону противника, moveTo.y ± 0 (или ближайшая безопасная высота)
    - для short cliff: moveTo.y += 80..140 вниз (если не deep void)
    - при стене: moveTo.x +/- 80 и включить rope_climb при needUp
- На уровне `BotTurnController`:
  - снизить порог `dx_small` для rope попытки (например, 110 → 80) только при `gap` или `obstacle`.
  - если `walk_stuck` срабатывает — разрешать rope_swing даже без `gap` при условии `obstacle`.

### 4) “Thinking” parallelization in browser
Цель — убрать микрофризы от `chooseBotPlan/chooseBotAction` с main thread.

**Approach A (Recommended): Web Worker**
- В `src/ai/worker/BotThinkWorker.ts`:
  - принимает snapshot (terrain compressed, worms, config, executeSeconds, ropeRemaining, seed),
  - возвращает plan/action и metrics (consideredCount, bestScore, ms).
- В `BotTurnController`:
  - если mode===aivai или user toggled “AI worker” — отправлять планирование в worker,
  - fallback: если worker не ответил до `planSeconds-ε`, использовать текущий main-thread путь.
- Логирование:
  - в `bot_decision.debug.trace.chosen` добавить `thinkSrc: "worker"|"main"`
  - в новых событиях (секция 2) также `thinkSrc`.

**Approach B: requestIdleCallback**
- Более простой, но не гарантирует smoothness; оставить как fallback.

### 5) Weapon balance research: expectedDamage vs realDamage
Добавить offline анализатор (скрипт) для локального запуска по одному/нескольким AIVAI JSON:
- вход: path(ы) к JSON или R2 key list.
- метрики:
  - по каждому `weaponId`:
    - count shots,
    - expectedDamage (из trace chosen, если есть),
    - realDamage (из physics_sample delta HP в окне 8s после shot),
    - killCount (если можно вывести),
    - friendlyFireDamage / selfDamage.
- выход: JSON + текстовый summary.

Где взять expectedDamage:
- если сейчас в `trace.chosen` нет expectedDamage, добавить:
  - `expectedEnemyDamage`
  - `expectedAllyDamage`
  - `expectedSelfDamage`
  - `expectedKillProb` (опционально)
Эти поля берутся из scoring функции, на финальном кандидате.

### 6) Admin UI: show AI_V
- В `AdminPanel.ts` во вкладке BOT:
  - рядом с `<span>Bot</span>` добавить `<span class="muted">AI_V=...</span>`
  - версия берётся из импортируемой константы.

## Risks & Mitigations
- Рост размера логов:
  - ограничить новые события только “по факту” (ropeAttempt/strategy change/stuck/replan).
- Worker сериализация terrain:
  - использовать seed + mapDataRef или компактный height/solid bitmap (частично уже есть `terrainFromLandscape`).
- Determinism:
  - в worker передавать seed; не использовать Math.random().

## Rollout / Validation
1) Добавить AI_V + вывод в админке.
2) Добавить новые trace-события (moveStrategy + ropeAttempt + thinkSrc).
3) Включить worker thinking по флагу (например, `botCfg.useWorker=true`).
4) Прогнать 10+ AIVAI матчей и проверить:
  - есть ли ropeAttempt события,
  - есть ли moveStrategy смены при стенах/обрывах,
  - уменьшились ли “no_damage shots” и friendly fire.
5) Запустить анализатор и посмотреть weapon таблицу (grenade доминирование vs blaster).

