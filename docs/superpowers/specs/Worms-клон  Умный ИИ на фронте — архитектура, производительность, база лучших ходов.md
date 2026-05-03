# Worms-клон: Умный ИИ на фронте — архитектура, производительность, база лучших ходов
## Резюме
Реализовать умный, расширяемый ИИ-агент для Worms-клона целиком на фронте — технически вполне осуществимо. Ключевые инструменты: Web Workers для вычислений вне главного потока, Transferable Objects для нулевой копии данных, Utility AI + MCTS с жёстким бюджетом итераций для принятия тактических решений, паттерн Strategy для расширяемости, и Case-Based Reasoning (CBR) с синхронизацией бэкенда для накопления и переиспользования лучших ходов. Все эти подходы хорошо протестированы в индустрии и имеют реализации на JS/TypeScript.

***
## 1. Общая архитектура системы
Правильная архитектура делит работу на три слоя.

**Главный поток** — рендер, ввод пользователя, физика, авторитативное состояние игры. Он не должен делать ничего тяжёлого: как только AI-вычисление блокирует главный поток дольше 16 мс, пользователь видит фриз.[^1][^2]

**AI Worker** — отдельный Web Worker, который получает snapshot мира, строит представление карты, генерирует кандидатные ходы, оценивает их и возвращает ранжированный список. Весь расчёт идёт параллельно с рендером.[^3][^1]

**Бэкенд (опционально)** — хранит базу успешных ходов (CBR-случаи), выдаёт их при старте игры. При наличии сети синхронизирует новые удачные ходы. При отсутствии сети — IndexedDB как локальный кэш.[^4][^5]

```
┌─────────────────────────────────┐
│        Главный поток            │
│  Рендер │ Физика │ Game State   │
│         ↕ postMessage           │
├─────────────────────────────────┤
│           AI Worker             │
│  Map Analysis → Action Graph →  │
│  Candidate Generation → Scorer  │
├─────────────────────────────────┤
│    Бэкенд / IndexedDB           │
│  CBR-база лучших ходов          │
└─────────────────────────────────┘
```

***
## 2. Передача данных без копирования
Самое болезненное место в схеме Worker — передача большого bitmap карты туда-обратно. При обычном `postMessage` браузер копирует ArrayBuffer, и для карты 1920×1080 это сотни миллисекунд на слабом Android.[^6][^7]

Решение: **Transferable Objects**. Передаёшь ownership буфера воркеру — главный поток теряет доступ к нему, но копирование равно нулю. Воркер после расчёта передаёт тот же буфер обратно.[^7]

```js
// Главный поток
const buf = terrainMask.buffer; // Uint8Array.buffer
aiWorker.postMessage({ type: 'calc', terrain: buf, state }, [buf]);
// buf теперь недоступен в главном потоке — zero-copy transfer

// Worker возвращает
self.postMessage({ type: 'result', terrain: buf, plan }, [buf]);
```

Альтернатива для случаев, когда оба потока должны читать одновременно: **SharedArrayBuffer**. Требует HTTP-заголовков `Cross-Origin-Opener-Policy` и `Cross-Origin-Embedder-Policy` на сервере, но даёт прямой shared-доступ без каких-либо копий.[^8][^9]

***
## 3. Принятие решений: Utility AI + MCTS с бюджетом
Для Worms-подобных игр лучшая задокументированная связка — **Utility AI** для быстрого скоринга кандидатных ходов и **MCTS** для углублённого анализа перспективных вариантов.[^10][^11]
### 3.1 Utility AI — оценка кандидатных ходов
Utility AI присваивает каждому возможному ходу числовое значение полезности. Итоговый скор можно считать аддитивно или мультипликативно по нескольким факторам:[^12][^13]

\[
U = \sum_{i=1}^{n} \omega_i \cdot \text{norm}(f_i)
\]

Где \( f_i \) — нормализованный фактор (ожидаемый урон, безопасность позиции, дистанция), \( \omega_i \) — вес. Для Worms типичный набор факторов:

| Фактор | Описание |
|--------|----------|
| `expectedDamage` | Ожидаемый урон по врагам из данной позиции |
| `selfRisk` | Риск самоподрыва или падения в воду |
| `positionSafety` | Экспозиция к ответному удару врага |
| `elevation` | Преимущество высоты |
| `coverAvailability` | Наличие укрытия после хода |
| `ammoEfficiency` | Ценность потраченного оружия |

Utility AI адаптируется в рантайме: достаточно изменить веса `ω_i` без переработки всей логики. Новое оружие — добавляешь новый фактор. Новая механика — добавляешь новый scorer. Существующие факторы не трогаешь.[^13][^12]
### 3.2 MCTS с ограничением по времени и памяти
MCTS — алгоритм итеративных симуляций: он не требует знания стратегии, только умения имитировать игру. Ключевое для мобильных устройств: MCTS можно останавливать в любой момент, получая лучший найденный вариант на текущий момент ("anytime algorithm").[^14][^15][^16]

```
while (timeRemaining > 0 && memoryUsed < memoryBudget) {
  selection → expansion → simulation → backpropagation
}
return bestMove();
```

**Memory-Bounded MCTS** решает проблему нехватки памяти на слабых устройствах через node recycling: когда бюджет памяти исчерпан, алгоритм переиспользует узлы дерева вместо выделения новых. На мобильном Android это принципиально важно.[^15]

На практике разумные бюджеты для мобильного браузера:
- Время: 300–800 мс на ход (пользователь не видит разницы)
- Память: 2–5 МБ под дерево симуляций
- Итерации: 200–1000 в зависимости от сложности позиции

Связка Utility AI + MCTS работает так: Utility AI быстро генерирует и фильтрует top-20 кандидатных ходов, MCTS углублённо анализирует только их, а не весь граф.[^10]

***
## 4. Паттерн Strategy для расширяемости
Вся система должна быть расширяемой без модификации ядра. Для этого хорошо работает паттерн **Strategy** из классического Game Programming Patterns — каждая стратегия (движение, тип оружия, физика, ветер) инкапсулируется в отдельный объект с общим интерфейсом.[^17][^18]

```typescript
interface ActionStrategy {
  id: string;
  getCandidates(state: GameState): Action[];
  score(action: Action, state: GameState): number;
}

// Регистр стратегий
const strategies = new Map<string, ActionStrategy>();

// Добавление новой стратегии без изменения ядра
strategies.set('bazooka', new BazookaStrategy());
strategies.set('grenade', new GrenadeStrategy());
strategies.set('rope', new RopeStrategy());
```

Для корректной работы с изменяющейся физикой и ветром — каждый scorer получает `GameConfig` как параметр. Изменение физики = обновление конфига, не переписывание стратегий.[^19][^17]
### 4.1 Blackboard как общая память
Между стратегиями нужна общая память, которую можно читать и писать без жёсткой связи. **Blackboard** — централизованный key-value store, который все компоненты AI используют как общий контекст. Воркер создаёт его в начале расчёта и передаёт всем стратегиям.[^13]

```typescript
interface Blackboard {
  terrainGraph: ActionGraph;
  enemyPositions: Position[];
  windVector: Vector2;
  currentWormHealth: number;
  cbrSuggestions?: CachedMove[]; // данные из CBR базы
  [key: string]: unknown;
}
```

Новая стратегия просто читает/пишет нужные ключи в Blackboard — никаких прямых зависимостей между компонентами.[^13]

***
## 5. Навигация по карте: Action Graph
ИИ не должен хранить заранее нарисованную карту. Вместо этого он строит **Action Graph** — граф достижимых состояний, пересчитываемый в Worker после каждого разрушения рельефа.[^20][^21]

**Узлы** — устойчивые позиции стояния червяка (нога на твёрдой поверхности, голова в воздухе). **Рёбра** — возможные переходы:

| Тип ребра | Условие | Стоимость |
|-----------|---------|-----------|
| `walk` | Горизонтальная поверхность, нет препятствий | Дистанция |
| `jump` | Физическая симуляция прыжка достигает целевого узла | Высота + дистанция |
| `fall` | Безопасная высота падения | Высота |
| `rope` | Видимая точка зацепа + симуляция качания | Стоимость оружия |
| `dig` | Наличие взрывчатки + покрытие | Стоимость оружия |

Рёбра проверяются не формулой, а короткой физической симуляцией с тем же collision-кодом, что в игре. Тогда граф валиден для любой карты, а не только заранее разрисованной.[^20]

***
## 6. Веревка как отдельный модуль
Веревка — отдельный `ActionStrategy`, не встроенная в основной pathfinding. Алгоритм:[^22]

1. Raycast вверх-вперёд для нахождения candidate anchors (точек зацепа)
2. Фильтрация по минимальному расстоянию и видимости
3. Для каждого anchor — упрощённая симуляция раскачивания (5–10 физических шагов)
4. Сохранение только тех вариантов, где червяк стабильно приземляется
5. Эти landing positions регистрируются как rope-рёбра в Action Graph

Веревка становится просто одним из типов ребра — плановик не знает, что это "особое" движение.

***
## 7. Case-Based Reasoning — база лучших ходов
CBR — один из наиболее практичных подходов для твоей задачи: накапливать успешные ходы и переиспользовать их в похожих ситуациях. Применяется в шахматных движках (chess opening repertoire), RTS-играх (армейские составы StarCraft) и других turn-based играх.[^23][^24][^25]
### 7.1 Структура случая (Case)
```json
{
  "id": "uuid",
  "contextVector": [0.3, 0.7, 0.1, 0.9], // нормализованный вектор ситуации
  "action": {
    "type": "bazooka",
    "angle": 47.3,
    "power": 0.8,
    "moveBeforeShot": { "direction": "right", "steps": 12 }
  },
  "outcome": {
    "damageDealt": 45,
    "selfDamage": 0,
    "finalPosition": { "x": 234, "y": 156 },
    "score": 0.91
  },
  "metadata": {
    "mapHash": "abc123",
    "timestamp": 1715000000,
    "playCount": 14,
    "winRate": 0.78
  }
}
```

**Context Vector** — компактное числовое представление ситуации: здоровье, дистанция до врага, угол обзора, наличие укрытий, ветер, доступные оружия. Это позволяет искать похожие случаи через косинусное сходство, не привязываясь к конкретным координатам карты.
### 7.2 Поиск похожего случая
```typescript
function findSimilarCase(query: ContextVector, cases: Case[]): Case | null {
  let best: Case | null = null;
  let bestSim = 0.6; // порог минимального сходства

  for (const c of cases) {
    const sim = cosineSimilarity(query, c.contextVector);
    if (sim > bestSim) {
      bestSim = sim;
      best = c;
    }
  }
  return best;
}
```
### 7.3 Интеграция с Utility AI
CBR-предложение не заменяет Utility AI, а усиливает его. Найденный случай поднимает скор соответствующего кандидатного хода:[^26][^25]

```typescript
if (cbrCase) {
  const similarAction = findMatchingCandidate(candidates, cbrCase.action);
  if (similarAction) {
    similarAction.score += 0.2 * cbrCase.outcome.winRate;
  }
}
```
### 7.4 Сохранение и синхронизация
**Локально** (IndexedDB) — сразу после завершения хода, без ожидания сети. При онлайне — синхронизация с бэкендом через Service Worker или простой `fetch`.[^4][^5]

**На бэкенде** — хранилище случаев с API:
- `GET /cases?mapHash={hash}&limit=50` — загрузка кейсов при старте игры
- `POST /cases` — отправка нового успешного хода

**При загрузке игры**: воркер получает топ-50 кейсов из IndexedDB или бэкенда и записывает их в Blackboard. Utility AI автоматически учитывает их в скоринге.

***
## 8. Производительность на слабых устройствах
Главная проблема — Android с низкопроизводительным процессором. iOS устройства обычно более актуальны по железу, реальной болью является Android.[^27]
### 8.1 Бюджет вычислений
| Компонент | Целевое время | Метод ограничения |
|-----------|--------------|-------------------|
| Построение Action Graph | < 50 мс | Инкрементальное обновление только изменённой зоны |
| Генерация кандидатов | < 30 мс | Лимит: max 30 кандидатов |
| MCTS симуляции | 300–600 мс | `Date.now()` таймер в цикле |
| CBR-поиск | < 10 мс | Ограниченная база: max 200 случаев |
| Utility scoring | < 20 мс | Без рекурсии, только линейный перебор |
### 8.2 Оптимизации
- **Typed Arrays** вместо объектов для terrain mask: `Uint8Array` в 10–20 раз быстрее в числовых операциях
- **Object pool** для нод MCTS — не создавать новые объекты в каждой итерации, переиспользовать пул
- **Incremental graph update** — при разрушении рельефа пересчитывать только затронутые узлы, не весь граф
- **Candidate pruning** — отбрасывать заведомо слабые ходы до MCTS через быстрый Utility pre-score
- **Time budget** — проверять `Date.now()` каждые 50 итераций MCTS, не каждую (вызов `Date.now()` тоже стоит времени)[^15]
### 8.3 Graceful degradation
Если устройство слабое — сокращаешь бюджет, не меняешь алгоритм:

```typescript
const budget = navigator.hardwareConcurrency <= 2
  ? { iterations: 200, candidates: 15 }
  : { iterations: 800, candidates: 30 };
```

***
## 9. Расширяемость: добавление нового контента
Паттерн Strategy и Blackboard-архитектура делают добавление нового контента изолированным:[^19][^17]

**Новое оружие**: создаёшь класс, реализующий `ActionStrategy`, регистрируешь его в реестре. Никаких изменений в ядре.

**Новое движение**: добавляешь новый тип ребра в Action Graph с соответствующей функцией проверки достижимости.

**Изменение физики (ветер, гравитация)**: обновляешь `GameConfig` в Blackboard. Все стратегии, которые проводят физическую симуляцию, автоматически используют новые параметры.

**Новая карта**: Action Graph строится динамически из bitmap — никаких изменений в коде.

**Новый тип стратегии поведения**: добавляешь новые факторы в Utility scorer, новые веса `ω_i`. Остальные факторы работают как прежде.

***
## 10. Полная схема взаимодействия
```
Начало хода:
  Главный поток:
    → Собирает GameSnapshot (terrain bitmap, позиции, инвентарь, ветер)
    → Загружает CBR кейсы из IndexedDB
    → Отправляет snapshot + кейсы в AI Worker (Transferable)

  AI Worker:
    1. Строит / обновляет Action Graph из terrain bitmap
    2. Загружает CBR предложения в Blackboard
    3. Генерирует кандидатные ходы через все зарегистрированные ActionStrategy
    4. Быстрый Utility pre-score → фильтрация до top-30
    5. MCTS в рамках временного бюджета
    6. Возвращает топ-3 хода + terrain bitmap (Transferable)

  Главный поток:
    → Принимает план
    → Выполняет лучший ход
    → Оценивает результат (нанесённый урон, итоговая позиция)

  После хода:
    → Если ход был успешным (score > порога):
      → Сохраняет кейс в IndexedDB
      → Синхронизирует с бэкендом (если онлайн)
```

***
## 11. Альтернативы и компромиссы
| Подход | Плюсы | Минусы | Подходит для |
|--------|-------|--------|--------------|
| **Utility AI + MCTS** | Расширяемый, контролируемый бюджет | Требует хорошего scorer | Основная рекомендация |
| **Чистый MCTS** | Не требует expert knowledge | Много итераций для качества | Прототип |
| **GOAP** | Планирование целей | Сложно дебажить, высокий O(nmk) | Сложный поведенческий ИИ |
| **Нейросеть (ONNX)** | Высокое качество | Размер модели, непредсказуемость | Офлайн-обучение |
| **Чистый CBR** | Прост, переиспользует опыт | Не работает на новых ситуациях | Усиление, не замена |

***
## Заключение
Система полностью реализуема на фронте без обращения к бэкенду при каждом ходе. Web Workers + Transferable Objects решают проблему производительности на слабых устройствах. Utility AI + MCTS с временным бюджетом обеспечивают разумное качество решений при контролируемой нагрузке. Паттерн Strategy + Blackboard делают систему расширяемой — новое оружие, движения и физика добавляются без переписывания ядра. CBR с синхронизацией через IndexedDB и бэкенд позволяет накапливать и переиспользовать лучшие ходы между сессиями.[^10][^1][^13][^24][^15][^7][^5][^17]

---

## References

1. [The State Of Web Workers In 2021 - Smashing Magazine](https://www.smashingmagazine.com/2021/06/web-workers-2021/) - The web is single-threaded. This makes it increasingly hard to write smooth and responsive apps. Wor...

2. [WEB WORKERS made my code over 100x faster (almost ZERO blocking time)](https://www.youtube.com/watch?v=sMa6d1dXJ-0&vl=de) - My game dev channel: https://www.youtube.com/@TypedPixels

Web workers provide a way to get some sor...

3. [Web Workers for game logic | Cinevva](https://app.cinevva.com/tutorials/web-workers-game-logic.html) - Offload heavy computation to Web Workers: physics, pathfinding, AI, and procedural generation withou...

4. [A backend for AI-coded apps - InstantDB](https://www.instantdb.com/essays/architecture) - Our claim is that Instant is the best backend you could use for AI-coded apps. ... IndexedDB is the ...

5. [Browser Storage Deep Dive: Cache vs IndexedDB for Scalable PWAs](https://dev.to/mino/browser-storage-deep-dive-cache-vs-indexeddb-for-scalable-pwas-35f4) - IndexedDB Backends ... These assets are static and rarely change, making the Cache API perfect for g...

6. [How I achieved a 50x speedup transferring large objects from the main JS thread to workers](https://dev.to/ackinc/how-i-achieved-a-50x-speedup-transferring-large-objects-from-the-main-js-thread-to-workers-4apn) - *starring ArrayBuffer, "transferable objects", and SharedArrayBuffer Working on a fun side-project -...

7. [Transferable objects - Lightning fast | Blog - Chrome for Developers](https://developer.chrome.com/blog/transferable-objects-lightning-fast) - With transferable objects, data is transferred from one context to another. It is zero-copy, which v...

8. [A godot dev said html5 games are difficult to do ... - Hacker News](https://news.ycombinator.com/item?id=36467309) - You need to spawn workers and they can only share certain things in memory between the threads (tran...

9. [Why SharedArrayBuffer Is So Powerful in Game Dev - Tiger's Place](https://tigerabrodi.blog/why-sharedarraybuffer-is-so-powerful-in-game-dev) - The Transferable alternative. postMessage supports "transferable" objects. You can transfer an Array...

10. [Combining Utility AI and MCTS](https://qedgames.pl/combining-utility-and-mcts/)

11. [Utility AI for turn-based combat](https://www.reddit.com/r/gameai/comments/1n1g4ws/utility_ai_for_turnbased_combat/) - Utility AI for turn-based combat

12. [apex-utility-ai-unity-survival-shooter](https://www.cnblogs.com/mimime/p/6221032.html) - The AI has the following actions available: ActionFunction Shoot Fires the Kalashnikov Reload Reload...

13. [A Strategy for Adaptive, Modular Game AI](https://www.theseus.fi/bitstream/handle/10024/893802/Tiilikainen_Toni.pdf?sequence=2&isAllowed=y)

14. [JSMCTS is a javascript implementation of Monte Carlo Tree ... - GitHub](https://github.com/grwhitehead/jsmcts) - JSMCTS is a javascript implementation of Monte Carlo Tree Search (MCTS) that can be used to implemen...

15. [[PDF] Memory Bounded Monte Carlo Tree Search - Orange Helicopter](http://orangehelicopter.com/academic/papers/powley_aiide17.pdf)

16. [Two Games with Monte Carlo Tree Search - null program](https://nullprogram.com/blog/2017/04/27/) - Monte Carlo tree search (MCTS) is the most impressive game artificial intelligence I've ever used. A...

17. [Design Patterns That Shaped the World of Games: History and ...](https://kokkugames.com/design-patterns-that-shaped-the-world-of-games-history-and-practical-application/) - By André Pasquali,Game Engineer at Kokku The concept of Design Patterns did not originate directly i...

18. [Design Patterns for Games](https://www.cs.rice.edu/CS/PLT/Publications/Java/sigcse2002b.pdf)

19. [Six Factory System Tricks for Extensibility and Library Reuse](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter05_Six_Factory_System_Tricks_for_Extensibility_and_Library_Reuse.pdf)

20. [Tactical Pathfinding on a NavMesh](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter27_Tactical_Pathfinding_on_a_NavMesh.pdf)

21. [WormAI - Navigation Meshes, Automatic Mapping, & Pathfinding](https://www.youtube.com/watch?v=nbulGnbDcEA) - This video summarizes and demonstrates the utility of Navmeshes as it applies to WormAI. WormAI is a...

22. [Pathfinding in a Cave Network - Scripting Support](https://devforum.roblox.com/t/pathfinding-in-a-cave-network/190540) - Hi, I have been faced with a challenge for a few days and I’m looking for outside input. I have AI t...

23. [A New Action-Based Reasoning Approach for Playing Chess](https://www.techscience.com/cmc/v69n1/42722/html) - Many previous research studies have demonstrated game strategies enabling virtual players to play an...

24. [[PDF] Case-Based Reasoning for Army Compositions in Real-Time ...](https://mcerticky.github.io/files/publications/scyr_2013.pdf) - We show how CBR can be used in the process of selecting the most effective army composition in a str...

25. [AI model for computer games based on case based reasoning and AI planning](https://research.tue.nl/en/publications/ai-model-for-computer-games-based-on-case-based-reasoning-and-ai-)

26. [Case Based Reasoning: Teaching AI to Learn From itself](https://aibussin.com/post/cbr/) - Imagine an AI that gets smarter every time it works not by retraining on massive datasets, but by le...

27. [Web Game Performance Optimization - Rune](https://developers.rune.ai/blog/web-game-performance-optimization) - Tips and Tricks for optimizing web games on low end mobile devices

