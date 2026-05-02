# Комплексная стратегия бота + накопление “best practices” (AIVAI)

## Цель

Расширить AI-стратегию за пределы “pit escape / trap attack” до комплексного поведения:

- бой (target selection, выбор оружия/угла/пауэра, контроль риска)
- позиционка (micro-reposition до/после выстрела, избегание края/самоподрыва/FF)
- навигация (обход препятствий, прыжки/верёвка/подрыв как mobility)
- командная стратегия (не мешать союзнику, фокус по уязвимым целям)

Дополнительно: накапливать “лучшие практики” (templates + priors) и переиспользовать:

- загружать перед боем
- обновлять в ходе боя
- сохранять после боя

Ссылка на базовую pit-спеку: [2026-05-02-pit-escape-trap-attack-sim-design.md](file:///workspace/docs/superpowers/specs/2026-05-02-pit-escape-trap-attack-sim-design.md)

## KPI (батч симуляций на разных картах/seed’ах)

“Ход” = любой bot-ход.

- `damageRate >= 0.50`: доля ходов, где `enemyDelta > 0`
- `goalRate >= 0.80`: доля ходов, где выполнен критерий успеха intent’а

Лимит итераций оптимизации: до 1000 циклов “изменение → симулятор → лог → commit”.

## Архитектура поведения: Intent + Utility

Вместо “сразу выбрать выстрел” вводится выбор intent на ход:

- `escape_pit`: выйти из ямы/полости (Jump → Rope → Dig)
- `attack`: нанести урон (shot planning)
- `reposition_safety`: уйти от края/из self-risk/из прострела
- `approach`: занять выгодную дистанцию/линию огня
- `deny_area`: избегать плохих разменов, вынудить противника открыть позицию
- `support`: не подставлять союзника (дефолтные ограничения + небольшие бонусы)

Выбор intent выполняется через utility-функцию:

- жёсткие “гейты” (если trapped → escape_pit обязателен)
- затем скоринг intent’ов по:
  - `risk`: self/edge/friendly
  - `opportunity`: ожидаемый урон / вероятность попадания / trap target
  - `time`: остаток времени хода, занятость мира, cooldowns
  - `ammo`: scarcity гранат

## Best practices store (templates + priors)

### Требование по хранению

- Хранить и применять priors/templates в рамках боя
- Persist в localStorage:
  - загрузить перед боем
  - сохранить после боя (или при досрочном завершении)

### Формат feature-key (v1)

Используется грубый ключ (чтобы переиспользовать и не “прибивать” к координатам):

- `mapSeed`
- `spawnType`: `pit|pit_overhang|box|open|cliff|gap` (эвристика из окружения)
- `intent`: `attack|escape_pit|reposition_safety|approach`
- `weaponId` (для attack)
- `windBin`: `round(wind/10)`
- `distBin`: `round(distanceToTarget/80)`
- `dYBin`: `round((targetY-shooterY)/60)`

Ключ:

`ai:bp:v1:${mapSeed}:${spawnType}:${intent}:${weaponId}:w${windBin}:d${distBin}:dy${dYBin}`

### Priors (attack)

Агрегированное значение:

- `n`
- `bestAngleBin`: `round(globalAngleDeg/2)`
- `bestPowerBin`: `round(power/4)`
- `meanScore` (EMA)
- `meanEnemyDelta` (EMA)
- `meanAllyDelta` (EMA)
- `updatedAt`

Обновляем только “чистые” сэмплы:

- `enemyDelta > 0`
- `allyDelta == 0`
- нет self-hit/слишком близко к selfSafe

### Templates (подстратегии)

Храним “какая подстратегия работает” и ключевые параметры:

- `program`: `pit_escape_jump|pit_escape_rope|pit_escape_dig|trap_grenade|micro_reposition_edge|cover_seek`
- `params`: компактные параметры (например `dir=left/right`, `ropeAngleBin`, `backoffMs`)
- `n`
- `successRate` (EMA)
- `updatedAt`

### Хранилище

LocalStorage ключ:

- `ww_ai_bp_v1`

Значение:

- JSON с лимитированным размером и LRU очисткой:
  - `priors: Record<featureKey, Prior>`
  - `templates: Record<featureKey, Template>`
  - `lru: Array<featureKey>` или `updatedAt` для pruning

Политика размера:

- жёсткий лимит записей (например 2000 ключей суммарно)
- при превышении — удаление старых по `updatedAt` (LRU)

## Как priors/templates влияют на решение

### Attack

- При генерации кандидатов угла/пауэра:
  - добавлять “seed candidates” вокруг `bestAngleBin/bestPowerBin` для данного featureKey
  - использовать эти кандидаты в начале (быстро получить хороший bestScore)
- При выборе между оружиями:
  - если для гранаты есть хороший prior и цель trapped → повышаем utility гранаты

### Escape / Reposition / Approach

- templates подсказывают:
  - порядок попыток (jump vs rope) и параметры (направление/угол rope, backoff)
  - “тонкая стенка” для dig (dir preference)

## Интеграция по жизненному циклу

- `startGame(aivai)`:
  - загрузить `ww_ai_bp_v1` из localStorage
  - прокинуть в BotTurnController/BotAI/worker (в worker — через init msg)
- Во время боя:
  - при `shot_eval` обновлять `priors` по featureKey
  - при успехе `escape_pit` обновлять `templates`
- `gameOver / abort`:
  - сохранить обновлённый store обратно в localStorage

## Производительность

- Вся логика должна оставаться локальной и дешёвой:
  - featureKey — простые биннинги
  - обновления store — O(1), с периодическим pruning
  - использование priors — добавление небольшого числа кандидатов, без взрыва combinatorics

## Логирование итераций

Файл: `docs/sim/aivai-bot-iterations.md`

Каждая итерация:

- кратко: что изменено (pit/attack/intent/priors/templates)
- метрики по батчу (damageRate/goalRate + разрез по картам)
- ссылка на commit

