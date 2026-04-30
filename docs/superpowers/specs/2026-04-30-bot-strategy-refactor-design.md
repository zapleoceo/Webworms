# Bot Strategy Refactor (AI vs AI) — Design
## Context
- Текущие aivai-логи показывают высокий процент выстрелов без урона и большое число ходов, где активный юнит практически не двигался.
- Причина в том, что план движения строится только если из новой позиции найден “хороший” выстрел; если выстрел не найден/всё отклонено, план становится null и движение не происходит.
- В конце хода бот всё равно стреляет (reserve_fire), даже если позиция не улучшена.

## Goals
- Сделать стратегию более продуктивной на картах с пустотами/сложной геометрией.
- Уменьшить “idle turns”: если нет хорошего выстрела, бот всё равно пытается улучшить позицию.
- Сохранить поведение “стрелять в конце” (reserve_fire) как есть, но улучшить движение до выстрела.
- Снизить friendly fire за счёт позиционки и risk-aware планирования.

## Non-goals
- Не менять физику, оружие, сетевой протокол.
- Не усложнять модель до полноценного планирования траекторий на десятки секунд вперёд.

## Current Observations (from logs)
- planShots часто равен 0 (план движения не строится).
- top reject reasons по shot-кандидатам: muzzle_blocked, self_unsafe, ally_unsafe.
- В “idle” ходах выстрел выполняется из той же точки, что и в начале execute-window.

## Proposed Architecture
### 1) Two-layer planning: Position Plan + Shot Plan
- Планирование хода разделяется на:
  - **Position plan**: выбор moveTo даже если нет гарантированного shot сейчас.
  - **Shot plan**: выбор оружия/угла/силы как раньше.
- На этапе планирования (planSeconds) выбирается moveTo, который максимизирует “позиционную полезность”, а не только shotScore.

### 2) PositionScore (новый скоринг позиции)
Для набора кандидатных X (как сейчас в chooseBotPlan) вычисляется:
- **path.reachable** и **movePenalty** (как сейчас, по distance/cost).
- **retreatScore**: по умолчанию приоритет “отойти от врага”:
  - если ближайший enemy ближе порога nearDist, бонус за увеличение дистанции.
- **allySpacingScore**: бонус за увеличение дистанции до ближайшего ally, если слишком близко.
- **muzzleOpennessScore**: простая оценка “насколько меньше будет muzzle_blocked”:
  - луч/пучок лучей по направлению к ближайшему enemy (несколько углов) и штраф за пересечения terrain рядом с muzzle.
- Итоговый score:
  - if shotScore найден: total = shotScore - movePenalty + positionScoreWeight * positionScore
  - if shotScore не найден: total = positionOnlyWeight * positionScore - movePenalty
- В результате chooseBotPlan может вернуть moveTo даже без найденного выстрела.

### 3) Anti-idle fallback
Если план не найден или перемещение не приводит к сдвигу:
- Вводится детектор “idle” (по прогрессу: малый delta позиции в течение N секунд execute-window).
- При idle выполняется fallback-движение:
  - попытка увеличить дистанцию до ближайшего enemy по поверхности (retreat).
  - если retreat невозможен — попытка разойтись с союзником.
  - если и это невозможно — попытка перейти в более “открытую” позицию (muzzle openness).

### 4) Friendly fire mitigation
- Учитывать noise (aimError/powerError) при оценке ally risk:
  - расширить safe radius вокруг союзника на safeExtra + f(noise).
- В shot scoring усилить штраф ally_unsafe так, чтобы он чаще “запрещал” выстрел, а не просто снижал score.

## Integration Points
- Bot planning:
  - chooseBotPlan — изменить логику выбора best plan, добавить positionScore и возможность plan без shot.
- Bot execution:
  - BotTurnController.executeMovement — приоритетно использовать plan.moveTo; если idle detector срабатывает, временно override на fallback move.
- Trace/debug:
  - aivai trace дополнить кратким summary причины выбора moveTo: positionScore breakdown (без больших структур).

## Testing/Validation
- Unit tests:
  - Добавить тесты на chooseBotPlan: возвращает moveTo даже если shotScore null (positionScore>0).
  - Добавить тест на anti-idle: при нулевом плане выбирается retreat fallback.
- Log-based regression:
  - На 3 данных логах проверить метрики: планов больше, idle меньше, доля noDamage меньше, friendly fire меньше.

## Rollout
- Код changes: BotAI.ts (chooseBotPlan + helpers), BotTurnController.ts (anti-idle hook), возможно BotConfig scoring поля (если нужно).
- Сохранить обратную совместимость с текущими botConfig (default values).

