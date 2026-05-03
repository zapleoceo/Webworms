# AIVAI Case Library (глобальные кейсы стратегий)

## Цель

Собирать после каждого матча top‑N (например 10) “кейсов стратегий”, которые:

- дали высокий реальный результат (enemyDelta)
- были “дешёвые” по действиям/времени/перемещениям
- безопасны (низкий ally/self урон)

И использовать их в новых матчах так, чтобы бот перед дорогим поиском:

1) извлёк подходящие кейсы под текущую ситуацию  
2) отфильтровал их быстрыми проверками применимости/безопасности  
3) запустил основной поиск и выбрал лучшее среди (кейсы ∪ поиск) по единому скорингу

Требование: гибрид

- локальный кеш (быстро)
- глобальная синхронизация (Cloudflare) общая для всех ботов

## Основные понятия

### Case (кейс стратегии)

Кейс — компактная запись “ситуация → действие/план → оценка”.

Минимальные поля:

- `aiV`: версия AI
- `stateKey`: ключ ситуации (см. ниже)
- `plan`: { `moveTo?`, `movePath?`, `action` }
- `outcome`: { `enemyDelta`, `allyDelta`, `goalOk`, `cost` }
- `utility`: агрегированная полезность (для сортировки)
- `meta`: { `weaponId`, `targetClass`, `createdAt`, `samples`, `emaUtility` }

### StateKey (ключ ситуации)

Нужен баланс: достаточно грубо для переиспользования, но не так грубо, чтобы кейсы ломались.

Рекомендуемый ключ:

- `aiV`
- `shooterBin`: `xBin = floor(x/64)`, `yBin = floor(y/64)`
- `enemyBin`: для ближайшего живого enemy: `dxBin=floor((ex-sx)/64)`, `dyBin=floor((ey-sy)/64)` с clamp диапазоном
- `weaponsMask`: битмаска доступных weaponId (или отсортированный список id, хешированный)
- `mapHint`: опционально `mapSeed` (или “local terrain signature”, если появится дешёвое вычисление)

Пример (строка):

`v:${aiV}|sx:${xBin}|sy:${yBin}|dx:${dxBin}|dy:${dyBin}|wm:${mask}|ms:${mapSeed}`

## Извлечение и применение в BotTurnController

### Шаг 0: подготовка библиотеки в начале матча

- при старте AIVAI матча клиент грузит top‑кейсы с сервера (пакетно) и кладёт в локальный кеш
- локальный кеш всегда имеет приоритет (мгновенный доступ), сервер — фоновая синхронизация

### Шаг 1: retrieval

Перед запуском планирования на ход:

1) построить `stateKey`
2) взять кандидатов по ключу:
   - локально: `casesByKey[stateKey]`
   - если локально пусто, можно использовать “соседние” ключи (±1 бин по dx/dy) как fallback
3) ограничить до K (например 20), отсортированных по `emaUtility`/`utility`

### Шаг 2: быстрые проверки применимости/безопасности

На каждого кандидата:

- “muzzle не в стену” (быстрый raycast по ландшафту)
- `selfSafe` / `allySafe`:
  - использовать уже существующую проверку для взрывных (в BotTurnController)
  - для не‑взрывных минимальная проверка “не стрелять в союзника вблизи линии”
- проверка валидности цели:
  - targetId если устарел → привязка к “targetClass” (например ближайший enemy) и пере‑маппинг
- наличие оружия/аммо/cooldown (если релевантно)

### Шаг 3: объединение с поиском

Далее:

- запуск обычного поиска (worker/main) как сейчас
- сравнение “лучшего кейса” и “лучшего результата поиска” по единому score:
  - минимум: `expectedDamage - movePenalty - riskPenalty`
  - кейсы, у которых нет ожидаемого score, оцениваются быстрым `expectedDamage` прогоном на фиксированных семплах (дешёвый режим)
- выбранный план исполняется

### Актуализация shotMemory/priors

Использование кейса должно обновлять `shotMemory` и “best practices” точно так же, как и результат поиска, иначе поведение будет расходиться между “нашёл” и “взял из кеша”.

## Сбор top‑кейсов после матча

### Источник данных

Используется AIVAI лог матча (events).

Минимально нужны:

- `bot_plan_start` (intent, expectedDamage, action, moveTo)
- `weapon_fired` (weaponId)
- `shot_eval` (enemyDelta, allyDelta, wormId, turnNo)
- `bot_wall_stall` (для штрафа)

### Правила отбора top‑10

Для каждого хода вычисляется:

- `utility = enemyDelta - A*allyDelta - B*moveCost - C*timeCost - D*wallStall`
- `moveCost`: например `|moveTo.x - shooter.x|` или `moveElapsed` если есть
- `timeCost`: “время до выстрела” (если есть), иначе 0

Фильтры:

- `allyDelta > 0` — либо отбрасывать, либо оставлять с большим штрафом (зависит от целевого поведения)
- `enemyDelta == 0` — обычно отбрасывать, если intent был `attack`
- “невалидные” (weaponIndex < 0) — отбрасывать

Далее берём top‑10 по utility и сохраняем как кейсы.

## Хранилище и API (Cloudflare)

### Почему D1 (а не KV/R2)

- нужен запрос “по stateKey” с сортировкой по utility и ограничением K
- нужен upsert с EMA статистикой (samples, emaUtility)

Для этого D1 наиболее прямой.

### Таблица (D1)

`aivai_cases`:

- `aiV TEXT NOT NULL`
- `stateKey TEXT NOT NULL`
- `caseId TEXT NOT NULL` (хеш `stateKey + normalizedPlan`)
- `planJson TEXT NOT NULL` (JSON)
- `weaponId TEXT`
- `samples INTEGER NOT NULL`
- `emaUtility REAL NOT NULL`
- `lastUtility REAL NOT NULL`
- `lastEnemyDelta REAL NOT NULL`
- `lastAllyDelta REAL NOT NULL`
- `updatedAt INTEGER NOT NULL`

Индексы:

- `(aiV, stateKey, emaUtility DESC)`
- `(aiV, updatedAt DESC)`

### API

- `POST /api/aivai/cases/ingest`
  - body: `{ aiV, matchId, cases: Case[] }`
  - server:
    - валидирует размер/поля
    - `INSERT ... ON CONFLICT(aiV,stateKey,caseId) DO UPDATE`:
      - `samples += 1`
      - `emaUtility = emaUtility*(1-alpha) + utility*alpha`
      - обновляет “последнее” (`lastUtility`, deltas)
- `GET /api/aivai/cases/top?aiV=...&stateKey=...&limit=20`
  - возвращает top‑K кейсов для ключа
- (опционально) `GET /api/aivai/cases/stats?aiV=...`
  - агрегаты по размеру базы, топ оружий, обновления

## Локальный кеш

Ключ: `ww_ai_cases_v1` (или IndexedDB если объём вырастет).

- хранит `Map<stateKey, Case[]>` ограниченный по:
  - максимум ключей (например 400)
  - максимум кейсов на ключ (например 30)
  - LRU eviction

## Безопасность и контроль роста

- жёсткий лимит на ingest: top‑10 на матч
- TTL/garbage collection: удалять записи старше N дней или с `samples < minSamples` и низким utility
- versioning по `aiV`: не смешивать кейсы разных версий, либо разрешать “перенос” только при совместимости

## Наблюдаемость

Добавить в AIVAI лог:

- `case_hit`: { wormId, turnNo, stateKey, caseId, used:1/0, rejectedReason? }
- `case_vs_search`: { caseScore, searchScore, winner }

Это позволит проверять “бот не думает” и что библиотека реально ускоряет и улучшает качество.

