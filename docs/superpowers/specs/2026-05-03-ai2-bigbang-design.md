# AI2 Big-Bang Refactor (Strategy + Blackboard + ActionGraph + Utility→MCTS + CBRv2 + LogsV2)

## Цель

Полностью снести текущую стратегию и реализовать новую систему принятия решений, как описано в документе “Worms‑клон: Умный ИИ на фронте — архитектура, производительность, база лучших ходов”, включая:

- AI Worker как единственное место вычислений и выбора плана
- Blackboard (PlanningContext) как общий контекст стратегий
- ActionGraph как граф достижимых состояний (walk/jump/fall/rope/dig) и инкрементальные обновления при разрушении рельефа
- Utility AI (fast pre-score) → top‑K кандидатов → MCTS (anytime, budgeted)
- CBR v2: contextVector + similarity retrieval + синхронизация Cloudflare D1 + локальный кэш
- Logs v2: объяснимость (почему не стрелял/почему шёл/почему “escape”), плюс данные для обучения/аналитики

Текущие реализации считаем прототипными и допускаем разрыв совместимости. Стабильность/качественная игра приоритетнее обратной совместимости.

## Не‑цели

- Поддержка старого формата AIVAI логов / D1 схемы / API как источника истины.
- Оптимизации SharedArrayBuffer/COOP/COEP до тех пор, пока качество стратегии не станет приемлемым.

## Текущее состояние (кратко)

Сейчас есть:

- Worker-планирование и pathfinding: [BotThinkWorker.ts](file:///workspace/src/ai/worker/BotThinkWorker.ts), [PathPlanner.ts](file:///workspace/src/ai/worker/PathPlanner.ts)
- “MCTS” как beam‑планировщик без дерева: [MctsPlanner.ts](file:///workspace/src/ai/mcts/MctsPlanner.ts)
- Case library + Cloudflare D1 (AIVaiCases): [CaseLibrary.ts](file:///workspace/src/ai/CaseLibrary.ts), [aivaiCases.ts](file:///workspace/worker/src/controllers/aivaiCases.ts)
- Логи AIVAI на R2 + extract/stats endpoint: [aivaiLogPublic.ts](file:///workspace/worker/src/controllers/aivaiLogPublic.ts)

Главные проблемы:

- нет модульности (Strategy registry + blackboard), логика размазана по контроллеру и воркеру
- нет map‑aware “тактик” и карты как high-level структуры (anchors/cover)
- MCTS не соответствует заявленному (нет дерева, UCT, budgeted anytime)
- CBR пока в основном seed‑ит shot search, а не полноценно участвует в выборке кандидатов по contextVector
- AIVAI логов недостаточно для объяснимости (“почему не стрелял”)

## Новые пакеты / неймспейсы

Новый AI живёт отдельно, чтобы можно было параллельно прогонять smoke и удалять старое позже:

- `src/ai2/**` — core AI2 (context, strategies, utility, mcts, cbr types)
- `src/ai2/worker/**` — worker runtime и message protocol
- `worker/src/controllers/aivaiCasesV2.ts` — CBRv2 API
- `worker/src/controllers/aivaiLogsV2.ts` — LogsV2 API (ingest + extract + stats)

## Message Protocol V2 (main → worker)

### Вход `plan`

- `jobId`, `rngSeed`, `difficulty`, `budgets`
- `terrainMask` (TypedArray buffer, Transferable)
- `terrainRevision` + `terrainPatches[]` после init
- `wormsPacked` (TypedArray)
- `worldCfg` (wind/gravity/mapSeed/teamAmmo)
- `cbrBootstrap` (top‑N cases for mapClass/aiV) в packed виде

### Выход `planResult`

- `planTop`: массив из `N` планов (по умолчанию 3) с `score/intent/move/shot`
- `debug`: summary + compact traces (top‑K utility, mcts stats, cbr hits)
- `diag`: timings (graph ms / candidates ms / mcts ms / total ms)

## PlanningContext (Blackboard) V2

Живёт только внутри воркера на один план‑запрос:

- `terrain`: TerrainQuery + derived fields (heightfield, void ratio, cover map)
- `graph`: ActionGraph (nodes/edges) + caches
- `entities`: shooter/allies/enemies snapshots (packed → decoded views)
- `inventory`: weapons/ammo/cooldowns (packed → decoded views)
- `cbr`: retrieved cases for current context + index data
- `priors`: best‑practices priors, mapClass priors
- `budgets`: time/memory/iterations
- `telemetry`: counters, rejected reasons, bestCandidates

## ActionGraph V2

### Nodes

Устойчивые позиции:

- опора под ногами (solid под foot points)
- голова в air (head clearance)
- нормализованные атрибуты: `surfaceY`, `slope`, `coverScore`, `edgeRisk`, `voidRisk`

### Edges

- `walk`: по поверхности без препятствий
- `jump`: короткая симуляция прыжка + landing test
- `fall`: безопасная высота падения + landing
- `rope`: anchor search + short swing sim + stable landing
- `dig`: изменение рельефа (crater) + достижимость

### Updates

- `terrainInit`: полный build
- `terrainPatch`: инкрементальные updates только в affected region

## Strategy Registry V2

Интерфейс:

- `id`
- `generate(ctx) -> Candidate[]`
- `utility(candidate, ctx) -> UtilityBreakdown`
- `refine(candidate, ctx, budget) -> Candidate[]` (опционально)

Стратегии:

- `AttackStrategy` (wrapper) — комбинирует WeaponStrategy + позиционирование
- `WeaponStrategy:*` — профили по оружию:
  - direct (handgun/heavy_gun)
  - close spread (shotgun/flamethrower)
  - ballistic (bazooka)
  - lob/splash robust (grenade)
  - homing
- `MovementStrategy` — high-level candidate positions на базе graph anchors/cover/elevation
- `RopeStrategy` — как самостоятельная генерация edges/candidates
- `TerrainChangeStrategy` — crater/dig как тактика (включая “вскрыть укрытие”, “выбить из ниши”)
- `EscapeStrategy` — детерминированный выход из ловушек (pit/niche/stuck) как стратегия, а не fallback

## Utility AI V2

Единый breakdown:

- `expectedDamageEnemy`
- `expectedDamageFriendly`
- `selfRisk` (explosion + void + fall)
- `positionSafety` (exposure/retaliation estimate)
- `elevation`
- `cover`
- `ammoEfficiency`
- `mobilityAfterAction` (escape options after shot)

Utility нормализуется и агрегируется по весам `ω_i` (difficulty/profile).

Output:

- top‑K candidates (K≈20–30)
- rejected counters (why candidates removed)

## MCTS V2 (budgeted anytime)

Настоящий цикл:

- selection (UCT/P‑UCT)
- expansion (from candidate refiner + opponent model)
- simulation (fast rollout using simplified policy)
- backpropagation (utility expected value)

Constraints:

- time budget (ms)
- node pool (memory bounded)
- early stop if plateau

Opponent model:

- first iteration: heuristic best‑response shot search (fast)
- later: reduced candidate set for opponent

## CBR v2

### Case schema

- `caseId`
- `aiV`, `mapClass`, `weaponId`
- `contextVectorQ`: `Int8Array` (quantized float vector)
- `action`: `{ moveNodeId?, moveType?, weaponId, facingRight, aimAngleBin, powerBin, targetClass }`
- `outcome`: `{ enemyDelta, allyDelta, selfDelta, expectedDamage, utility, win }`
- counters: `samples`, `emaUtility`, `updatedAt`

### Retrieval

Pipeline:

- coarse filter: `aiV + mapClass + weaponId?`
- similarity: cosine on dequantized vector or dot on int8
- return top‑N with thresholds

### Integration

CBR returns candidates into the same candidate list as strategies (not только seeds).

## Logs V2 (AIVAI)

Новый event format:

- `ai_snapshot` (hash + metadata)
- `ai_map_features` (mapClass, void/cover metrics)
- `ai_action_graph_stats` (node/edge counts, build/update ms)
- `ai_candidates_topk` (top‑K breakdown compressed)
- `ai_mcts_summary` (iters, nodes, best path)
- `ai_cbr_hit` (caseId, sim, deltaUtility)
- `ai_decision` (final plan + reason)
- `ai_exec_result` (damage deltas, position, terrainChange)

Индексированные endpoints:

- `GET /aivai/v2/log/stats?matchId=...`
- `GET /aivai/v2/log/extract?matchId=...&types=...`

## Миграция / удаление старого

1) AI2 внедряется параллельно под флагом режима `mode=aivai2` на фронте (без UI polish).
2) Добавляем новые endpoints v2 на воркере (параллельно старым).
3) После нескольких AIVAI прогонов на ключевых картах фиксируем метрики “tupnyak/ff/self/void”.
4) Переключаем `aivai` на AI2 по умолчанию.
5) Удаляем старый AI (ai/worker/mcts/CaseLibrary legacy) и старые endpoints.

## Acceptance criteria (первый релиз AI2)

- AIVAI на `in_pc` и “колёсных/арочных” картах:
  - падения в void и self‑shots встречаются значительно реже
  - `noShot→approach` уменьшается при close-range контакте
  - в логах всегда есть объяснение (utility top‑K + mcts summary + reject reasons)
- Время планирования: стабильно в пределах заданного бюджета, без фризов main thread.

