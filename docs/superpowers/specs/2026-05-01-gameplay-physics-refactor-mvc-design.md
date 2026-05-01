# Рефакторинг Gameplay+Physics: MVC и разделение ответственности (инкрементально)

## 0) Цель и ограничения
### Цель
- Провести код-ревью и **инкрементально** привести Gameplay+Physics к более строгой архитектуре с понятными границами ответственности (MVC/слои), минимизируя риск регрессий.

### Ограничения
- Не делаем “каждую функцию в отдельный файл”; выносим только **крупные модули/подсистемы**.
- Не “переписываем всё разом”: применяется Strangler pattern (новые модули появляются рядом со старой логикой, затем постепенно переключаем вызовы).
- После каждого логически-атомарного шага — прогон `npm test` и `npm run build`.

## 1) Текущее состояние (наблюдения по репозиторию)
- `GamePresenter` одновременно содержит:
  - логику game loop/turns,
  - обработку input,
  - создание сущностей,
  - стрельбу/спавн projectile,
  - часть правил режима.
- `PhysicsEngine` содержит:
  - интеграцию worm, projectile, props, brand logos,
  - доменные правила (взрывы, кратеры, урон),
  - частично эффекты (audio hooks/trace).
- `CanvasRenderer` одновременно:
  - отрисовка мира,
  - преобразование terrain texture,
  - подготовка assets/caches для физики дропов (support points).

Итог: “God objects” усложняют тестирование, повторное использование и безопасные изменения.

## 2) Что означает MVC в рамках этой игры
Мы фиксируем слои так, чтобы код был проверяемым и расширяемым:

### Model (состояние и правила данных)
- `models/*`: состояния сущностей (Worm/Projectile/BrandLogo/GameState/Landscape).
- Модель не должна зависеть от View (DOM/canvas) и не должна тянуть UI/аудио.

### Controller/Presenter (правила игры)
- Управляет ходом, применяет правила режимов, вызывает физику, запускает стрельбу, решает “когда следующий ход”.

### View (рендер и input adapters)
- `views/*`: CanvasRenderer/InputHandler + UI helpers.
- View читает состояние (read-only) и рисует; input переводит события в команды для presenter.

## 3) Целевая структура (минимально-инвазивная)
Добавляем новый “gameplay слой” без слома существующих импортов:

- `src/game/`
  - `core/`
    - `GameClock.ts` (dt/accumulator policy)
    - `GameEvents.ts` (typed events, без UI)
  - `turns/`
    - `TurnSystem.ts` (turn lifecycle, nextTurn, условия окончания хода)
  - `combat/`
    - `WeaponSystem.ts` (fireWeapon, ограничения burst/ammo, единая точка применения weapon rules)
  - `physics/`
    - `WorldPhysics.ts` (оркестратор: worm/projectile/props/logos)
    - `ProjectilePhysics.ts` (ветки projectile/grenade/homing)
    - `WormPhysics.ts`
    - `PropPhysics.ts`
    - `LogoPhysics.ts`
    - `ExplosionSystem.ts` (explode/explodeAt + crater/material rules)

На первом этапе `GamePresenter` и `PhysicsEngine` остаются, но начинают делегировать в эти модули.

## 4) Дедупликация и “один экземпляр функции”
Под “один экземпляр” фиксируем правило:
- Доменные алгоритмы не копируются между AI/Runtime/Renderer.
- Общие вычисления выносятся в 1 модуль (например: clamp/angleNorm, sweep vs terrain, weapon burst counters).
- Различия между runtime и AI симуляцией допускаются только если они формализованы интерфейсом (например: `TerrainQuery` vs `Landscape`).

Наследование применяем точечно (например, base-тип “entity” не обязателен); предпочтение — композиция и чистые функции для алгоритмов.

## 5) Порядок работ (этапы)
### Этап A — Code review + карта ответственности
- Составить таблицу “кто за что отвечает” для `GamePresenter`, `PhysicsEngine`, `CanvasRenderer`.
- Выделить основные доменные invariants (что всегда должно быть true).

### Этап B — TurnSystem
- Вынести правила конца хода (training/ai/random/friend) в `TurnSystem`.
- `GamePresenter.update()` делегирует решение “закончить ход?” в `TurnSystem`.

### Этап C — WeaponSystem
- Вынести `fireWeapon` и связанные ограничения (burst, ammo, cooldown) в `WeaponSystem`.
- Свести все weapon-specific rules в одном месте.

### Этап D — WorldPhysics оркестратор
- Разделить `PhysicsEngine.step()` на подмодули:
  - worm/projectile/props/logos
  - explode/crater
- Сохранить публичный API `PhysicsEngine.update(state, dt)` на переходный период.

### Этап E — Удаление старых веток
- После переноса и стабилизации — удалять дублирующий код в `GamePresenter/PhysicsEngine`.

## 6) Тестовая стратегия (обязательная)
- Базовый safety net: всегда гоняем существующие unit tests.
- Добавляем “архитектурные” тесты только там, где они реально защищают:
  - turn end conditions (training vs non-training)
  - burst counters reset on nextTurn
  - grenade SDF не туннелит
  - airdrop/grave stability (NaN-free + settle)
- Для крупных переносов — добавляем snapshot-like тесты на “одинаковый outcome” (например: одинаковые state transitions за N тиков на фиксированном seed).

## 7) Критерии готовности
- `GamePresenter` больше не содержит доменных деталей физики/оружия; он вызывает `TurnSystem/WeaponSystem`.
- `PhysicsEngine` становится тонким фасадом над `WorldPhysics` (или полностью заменяется).
- Дублирование ключевых алгоритмов уменьшается, и нет “двух разных реализаций” одного и того же правила.
- Все тесты проходят + build зелёный на каждом этапе.

