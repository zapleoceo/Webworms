# AIVAI: Worker Terrain Sync via Crater Patches

## Проблема

Сейчас при каждом запросе планирования в AI worker основной поток отправляет в воркер полный `landscape.grid` (width×height) как `ArrayBuffer`. Это:

- создаёт большую аллокацию и копирование (`grid.slice()`) на каждый план/replan;
- увеличивает GC pressure и ухудшает стабильность времени кадра;
- лишает возможности часто перепланировать без заметной нагрузки.

В отличие от SharedArrayBuffer, этот проект активно использует сторонние ресурсы (включая PayPal), поэтому включение cross‑origin isolation ради SAB рискованно.

## Цель

Сделать синхронизацию террейна между main и worker инкрементальной:

- полный grid отправляется **один раз** (при инициализации воркера или смене карты);
- далее в worker отправляются только **патчи кратеров** (crater events), которые обновляют worker‑копию grid;
- планирование продолжает использовать точную сетку, но без постоянного пересылания массива.

## Источники данных кратеров в текущем коде

`Landscape` уже поддерживает кратеры и хранит их в нескольких очередях:

- `syncCraters` (для сетевой синхронизации): [Landscape.ts](file:///workspace/src/models/Landscape.ts#L10-L13), используется в [MultiplayerSync.ts](file:///workspace/src/network/MultiplayerSync.ts#L600-L646)
- `dfEvents` (reset/crater) для distance field: [Landscape.ts](file:///workspace/src/models/Landscape.ts#L9-L30), читается без очистки через `lastEventIndex` в [TerrainDistanceField.ts](file:///workspace/src/physics/TerrainDistanceField.ts#L219-L251)
- `revision` инкрементируется на `createCrater(...)`: [Landscape.ts](file:///workspace/src/models/Landscape.ts#L198-L227)

Для worker‑патчей удобнее всего использовать `dfEvents`, потому что:

- события не “съедаются” и не очищаются другими подсистемами;
- есть тип `reset`, который закрывает кейс “смена карты/перегенерация”.

## Протокол сообщений main → worker

### 1) Terrain init

Отправляется один раз при старте воркера или при обнаружении несинхрона.

- `kind: 'terrainInit'`
- `width`, `height`
- `grid: ArrayBuffer` (transferable)
- `dfEventIndex: number` (events.length на момент init)
- `revision: number` (landscape.revision)

### 2) Terrain patch

Отправляется перед планированием, если у main появились новые события `dfEvents` после `dfEventIndex`.

- `kind: 'terrainPatch'`
- `fromEventIndex: number`
- `toEventIndex: number`
- `events: Array<{ kind:'reset'|'crater', x?:number, y?:number, r?:number }>`

Правило: `events` содержит `dfEvents.slice(fromEventIndex, toEventIndex)`.

## Применение патча в worker

Worker держит свою структуру террейна в памяти (не пересоздаёт на каждый план):

- `terrain.width/height`
- `grid: Uint8Array`
- `dfEventIndex` (последний применённый)
- `revision` (последний применённый)

Для `reset`:

- очищаем grid (или требуем `terrainInit`, если reset означает “новая карта”).

Для `crater`:

- применяем круговое стирание как в `Landscape.createCrater`, включая:
  - защиту границ (30px)
  - игнор alloy material=255
  - `effectiveRadius = r + 1.5` (как в main)

## Изменения в проекте (границы ответственности)

### Main (BotTurnController)

- хранить:
  - `workerTerrainReady` (bool)
  - `workerTerrainEventIndex` (число событий, которые уже отправлены в worker)
  - `workerTerrainRevision` (последняя ревизия landscape, известная воркеру)
- при `startWorkerPlan`:
  - если worker не готов → отправить `terrainInit` (grid без `slice`, а через transfer, если возможно безопасно)
  - иначе → отправить `terrainPatch` (dfEvents delta) и только потом `plan`

### Worker (BotThinkWorker)

- расширить `onmessage` обработку:
  - принимать `terrainInit` и сохранять состояние
  - принимать `terrainPatch` и применять к grid
  - `plan` использует уже обновлённый grid

### Совместимость

Если worker потерял состояние (перезагрузка, ошибка, mismatch размеров):

- main повторно шлёт `terrainInit` перед следующим `plan`.

## Производительность и лимиты

Ожидаемый эффект:

- устранение полной пересылки `width*height` на каждый план/replan;
- нагрузка становится пропорциональна числу кратеров между replans (обычно мало).

Ограничение:

- `dfEvents` растёт по мере матча. Main должен отправлять только delta по индексу, не пересылая всю историю.

## Тестирование

- Unit: worker применяет `terrainPatch` и “дырка” в grid соответствует `createCrater`.
- Integration: AI планирование работает после серии crater events без повторной отправки полного grid.

