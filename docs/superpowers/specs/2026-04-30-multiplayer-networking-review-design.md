# Multiplayer Networking Review (P2P WebRTC) — Design & Code Review

## Контекст и цель

В проекте есть два сетевых режима:

1) **Random matchmaking** — подбор случайного игрока.
2) **Friend invite** — игра с другом по ссылке `?room=ROOM_ID`.

Цель этого документа:

- Зафиксировать текущую реализацию и потоки данных end-to-end.
- Провести код‑ревью с упором на:
  1. Производительность клиента (CPU/GC/сеть).
  2. Оптимальное использование запросов к серверу/БД (D1/KV/DO).
  3. Комфорт геймплея (плавность/джиттер/тайминги/фейлы).
  4. Чистоту структуры (ответственности, “MVC”, тестируемость).
- Предложить улучшения, сохраняя **P2P WebRTC (DataChannel)** для геймплея, а сервер — только для matchmaking/signaling.

## Current Architecture (как есть сейчас)

### Компоненты (frontend)

- Game loop / host authority: [GamePresenter.ts](file:///workspace/src/presenters/GamePresenter.ts)
- Мультиплеер-контроллер: [MultiplayerController.ts](file:///workspace/src/controllers/MultiplayerController.ts)
- Transport + signaling + state sync: [MultiplayerSync.ts](file:///workspace/src/network/MultiplayerSync.ts)
- HTTP клиент: [APIClient.ts](file:///workspace/src/network/APIClient.ts)
- Entry/UI: [main.ts](file:///workspace/src/main.ts)

### Компоненты (backend)

- Worker routes + DB init: [worker/src/index.ts](file:///workspace/worker/src/index.ts)
- Rooms / matchmaking: [rooms.ts](file:///workspace/worker/src/controllers/rooms.ts)
- Signaling HTTP: [signaling.ts](file:///workspace/worker/src/controllers/signaling.ts)
- Signaling WS DO: [SignalingDO.ts](file:///workspace/worker/src/durable/SignalingDO.ts)
- D1 schema: [schema.sql](file:///workspace/worker/schema.sql)

## Flows

### A) Friend invite (link)

1) Host creates room:
   - `POST /api/rooms` → `{roomId}`
   - Invite URL: `...?room=<roomId>`
   - Код: [main.ts](file:///workspace/src/main.ts#L620-L727), [APIClient.createRoom](file:///workspace/src/network/APIClient.ts#L207-L219), [rooms.ts:createRoom](file:///workspace/worker/src/controllers/rooms.ts#L1-L27)
2) Client opens link:
   - Parse `room` from query and connect:
   - Код: [main.ts](file:///workspace/src/main.ts#L637-L675), [MultiplayerController.connect](file:///workspace/src/controllers/MultiplayerController.ts#L49-L53)
3) Reserve room:
   - `POST /api/rooms/:roomId/join` → KV `ROOMS` status `reserved` / `clientId`
   - Код: [APIClient.joinRoomState](file:///workspace/src/network/APIClient.ts#L221-L241), [rooms.ts:joinRoomState](file:///workspace/worker/src/controllers/rooms.ts#L156-L211)
4) Signaling:
   - Primary: WS `/api/rooms/:id/ws` (DO)
   - Fallback: HTTP polling `GET /snapshot` + `POST /signal` (KV)
   - Код: [MultiplayerSync.initSignalingSocket](file:///workspace/src/network/MultiplayerSync.ts#L46-L114), [MultiplayerSync.startPollingSignaling](file:///workspace/src/network/MultiplayerSync.ts#L191-L223), [SignalingDO](file:///workspace/worker/src/durable/SignalingDO.ts#L41-L70), [signaling.ts](file:///workspace/worker/src/controllers/signaling.ts#L28-L75)

### B) Random matchmaking

1) Client requests a match:
   - `POST /api/rooms/random {playerId}`
   - Код: [APIClient.joinRandomRoom](file:///workspace/src/network/APIClient.ts#L243-L262), [rooms.ts:joinRandomRoom](file:///workspace/worker/src/controllers/rooms.ts#L29-L113)
2) Server:
   - Waiting rooms in KV `ROOMS` (TTL 1h)
   - Queue in D1 `MatchmakingQueue(room_id PK, host_id, created_at)`
   - Код: [schema.sql](file:///workspace/worker/schema.sql#L106-L111)
3) Host heartbeat while waiting:
   - `POST /api/rooms/:id/heartbeat` every 15s
   - Код: [MultiplayerSync.startHeartbeat](file:///workspace/src/network/MultiplayerSync.ts#L419-L436), [rooms.ts:heartbeatRoom](file:///workspace/worker/src/controllers/rooms.ts#L115-L154)

### C) P2P gameplay sync (после соединения)

- Модель: **host authoritative**.
- Client → host: `action` (input).
- Host → client: `sync` state.
- Частота state sync: throttling ~20 FPS.
- Код:
  - `sync` payload: [MultiplayerSync.sendStateSync](file:///workspace/src/network/MultiplayerSync.ts#L452-L503)
  - apply on client: [MultiplayerController.applyHostState](file:///workspace/src/controllers/MultiplayerController.ts#L61-L139)

## Review Against Requirements

### 1) Производительность клиента

**Наблюдения**
- `sync` отправляется ~20 FPS и содержит “полу‑full snapshot” (`players[]` и `projectiles[]` каждый раз) в JSON: [MultiplayerSync.ts](file:///workspace/src/network/MultiplayerSync.ts#L460-L497)
- На клиенте `projectiles` пересоздаются каждый sync (аллокации, GC, визуальный “ресет”): [MultiplayerController.ts](file:///workspace/src/controllers/MultiplayerController.ts#L124-L132)
- Нет `seq/tick`, нет backpressure по `dataChannel.bufferedAmount`, нет интерполяции → дергание и риск “лаг в хвост”.

**Риски**
- CPU/GC на слабых устройствах (особенно при большом числе пуль/объектов).
- При ухудшении сети datachannel может копить буфер, увеличивая задержку ввода/обновлений.

**Рекомендуемые изменения (приоритет P0/P1)**
- P0: добавить `syncSeq`/`tick` в sync, на клиенте игнорировать устаревшие.
- P0: вынести `mapData/mapSeed` из каждого sync в отдельный `init` (один раз).
- P0: ввести backpressure: если `bufferedAmount` выше порога — пропустить кадр sync.
- P1: добавить `projectileId` и обновление по id без пересоздания.
- P1: client interpolation (snapshot buffer 50–100ms) для worm/projectile.

### 2) Оптимальное использование запросов к БД и серверу

**Наблюдения**
- Random matchmaking:
  - `/api/rooms/random` делает cleanup DELETE + SELECT + до 5 KV reads + KV write + D1 delete/insert: [rooms.ts](file:///workspace/worker/src/controllers/rooms.ts#L29-L113)
  - `/api/rooms/:id/heartbeat` на каждый тик делает UPDATE + глобальный DELETE + SELECT (и иногда KV read): [rooms.ts](file:///workspace/worker/src/controllers/rooms.ts#L115-L154)
- Глобальный DELETE “старше 1 дня” в heartbeat — write amplification на горячем пути.
- Возможны гонки reserve (двое клиентов могут почти одновременно зарезервировать одного хоста, last-write-wins в KV).

**Рекомендуемые изменения**
- P0: убрать глобальный cleanup из heartbeat:
  - либо cron/scheduled cleanup,
  - либо “редкий cleanup” (например, раз в N минут, флагом/таблицей),
  - либо индексы по времени + bounded cleanup.
- P0: добавить индекс(ы) под `MatchmakingQueue` (минимум по `created_at`, и/или `(host_id, created_at)`).
- P1: усложнить генерацию `roomId` и проверять коллизии (или увеличить длину id).
- P1: atomic reserve:
  - либо через Durable Object “matchmaker” (один writer),
  - либо D1 транзакция + “lease” модель,
  - либо DO на комнату + explicit lock.

### 3) Комфортный геймплей

**Наблюдения**
- Нет сглаживания/интерполяции; позиции и скорости применяются жёстко: [MultiplayerController.applyHostState](file:///workspace/src/controllers/MultiplayerController.ts#L97-L122)
- При джиттере и пересоздании projectile визуально “рвётся” траектория.
- По окончании `turnTimeLeft` поведение зависит от “isStable”; при большом числе снарядов возможен UX “ожидания”, но это ожидаемо для turn-based — важно не создавать новые снаряды после таймера (уже внедрено для minigun).

**Рекомендуемые изменения**
- P0: interpolation буфер.
- P1: выделить “events” (взрыв/кратер/звук) отдельно от “state”, чтобы state не блокировал событийность.

### 4) Структура кода и чистота (разделение ответственности / MVC)

**Наблюдения**
- В целом структура близка к MVC:
  - model: `GameState/Worm/Projectile`
  - controller/game logic: `GamePresenter`
  - view: `CanvasRenderer`
  - network: `MultiplayerController/MultiplayerSync/APIClient`
- Смешение ответственностей в сетевой части:
  - `MultiplayerController.applyHostState` одновременно: decoding + mutation + object lifecycle.
  - `MultiplayerSync.sendStateSync` содержит формат протокола inline (сложно версионировать/менять/тестировать).
- Signaling имеет 2 источника состояния:
  - DO хранит в памяти,
  - HTTP fallback хранит в KV,
  - DO не восстанавливается из KV при рестарте (риск потери snapshot при эвикте DO).

**Рекомендуемые изменения**
- P0: выделить `StateCodec` (pack/unpack + seq/tick + версионирование).
- P1: выделить `StateApplier` (применение на клиенте + smoothing).
- P1: унифицировать signaling source of truth:
  - DO читает/пишет в storage (DurableObjectStorage) и может обслуживать HTTP snapshot тоже,
  - либо KV-only, но тогда DO должен уметь восстановиться из KV.

## Предлагаемые варианты улучшений (без смены P2P)

### Вариант 1 — Minimal “v1.1” (рекомендованный старт)

- Добавить `seq/tick` + отбрасывание старых sync.
- `init` сообщение (mapSeed/mapData один раз).
- Backpressure по `bufferedAmount` (пропуск state кадров).
- `projectileId` + обновление projectiles по id.
- Client interpolation.

Результат: максимально быстрый прирост качества без переписывания архитектуры.

### Вариант 2 — Protocol v2 (эффективность)

- Бинарный `ArrayBuffer` вместо JSON.
- Квантизация координат/углов.
- Delta updates.
- Разделение на `input/state/events`.

### Вариант 3 — Масштабирование matchmaking/signaling

- Matchmaking в DO (меньше D1 нагрузки, более атомарная логика).
- Убрать глобальные DELETE из heartbeat (cron).
- Single source-of-truth для signaling (DO storage).

## План внедрения (рекомендованный порядок)

1) v1.1 state sync:
   - seq/tick, init, bufferedAmount guard.
2) projectile ids + stop recreate.
3) interpolation.
4) server-side: оптимизация heartbeat + индексы D1.
5) signaling unification.
6) protocol v2 (опционально).

## Метрики и критерии успеха

- Клиент: стабильные 60fps (render), отсутствие частых GC spikes при стрельбе.
- Сеть: уменьшение среднего размера sync payload и/или стабильная частота без “buffer growth”.
- UX: отсутствие “телепортов” при умеренном джиттере, предсказуемый конец хода.
- Server: уменьшение количества D1 writes на heartbeat, отсутствие full-scan delete на hot-path.

