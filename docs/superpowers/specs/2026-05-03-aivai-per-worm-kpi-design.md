# AIVAI per-worm KPI (CI + log analysis)

## Цели

Per-worm (wormId) метрики:

- ≥90% достижение цели стратегии (в терминах intent в начале хода)
- ≥60% ходов с уроном врагу (только реальный)
- ≤10% ходов с уроном себе или союзнику (только реальный)
- wall-stall почти отсутствует (допуск ≤1% ходов)
- ≥50% “позиция для стрельбы не стала хуже” (eps=1)
- выбор оружия должен быть не “всегда одно”, и в каждом ходе выбирать максимум ожидаемого урона из доступных

## Источники данных

### Реальный урон (единственный допустимый источник)

Реальный урон за ход фиксируется через health-delta после стабилизации мира:

- при выстреле сохраняется `health0[]` по всем worm
- после того как нет снарядов и мир не занят, вычисляются:
  - `enemyDelta = Σ max(0, health0[i] - health1[i]) по врагам`
  - `allyDelta = Σ ... по союзникам (включая self)`

Это уже реализовано и эмитится как AIVAI событие `shot_eval`.

### AIVAI события для корреляции ходов

- `bot_plan_start` (wormId, turnNo, plan.intent, plan.action, plan.moveTo)
- `weapon_fired` (wormId, turnNo, weaponId)
- `shot_eval` (wormId=shooterId, turnNo, enemyDelta, allyDelta)
- `bot_wall_stall` (wormId, turnNo)
- (опционально) `bot_movement_summary` для диагностики

Ключ корреляции внутри матча: `(wormId, turnNo)`.

## CI-гейт (интеграционный мини-прогон)

### Датасет

Используется существующий “сим-набор” (детерминированные простые террейны, создаваемые в тесте) без загрузки карт-изображений.

### Исполнение

- Мини-раннер шагает мир по кадрам: input → physics → bot controller → turn system.
- План для каждого хода рассчитывается синхронно через `chooseBotActionDebug(...)` (без воркера), затем подаётся в `BotTurnController` как готовый `plan`.
- Для урона используется только `shot_eval`, т.е. реальная физика/взрывы/пули.

### Агрегация и проверки

В CI проверяются:

- метрики собираются per-worm и не пустые
- `wallStallRate` близко к нулю на простом террейне (регресс-гейт)
- `shot_eval` корректно связывается с `weapon_fired` в пределах того же `(wormId, turnNo)`

Численные KPI по enemy/self/ally damage и goal success в CI пока используются как smoke-check и печать в вывод теста, без жёсткого гейта на 60%/10%, чтобы избежать флаки на малой выборке.

## Оффлайн-анализ матч-логов

Отдельный скрипт анализирует выгрузки AIVAI логов и считает те же per-worm KPI по тем же событиям, с основной статистикой по реальным матчам.

## Определения метрик

### goalSuccessRate

На основе `bot_plan_start.plan.intent`:

- `attack`: успех если в том же `(wormId, turnNo)` есть `shot_eval.enemyDelta > 0`
- `approach`: успех если `positionNotWorse` выполнена
- `pit_escape_*`: успех если по состоянию конца хода worm перестал быть trapped (PitAnalyzer) или depth уменьшилась заметно

### enemyDamageRate

Доля ходов с `shot_eval.enemyDelta > 0`.

### selfOrAllyDamageRate

Доля ходов с `shot_eval.allyDelta > 0`.

### wallStallRate

Доля ходов, где есть `bot_wall_stall`.

### positionNotWorseRate

Сравнение “лучший expectedDamage из позиции” до и после хода:

- `beforeExpected = bestExpectedDamage(beforePos)`
- `afterExpected = bestExpectedDamage(afterPos)`
- успех если `afterExpected >= beforeExpected - 1`

### weaponDiversity

Распределение `weapon_fired.weaponId` и число уникальных weaponId на прогоне.

