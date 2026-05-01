# Grenade + Worm/Drop Contour Collisions (Design)

## Problem

1) Граната иногда “коллизит странно” и может проскальзывать/проваливаться в узких местах, а при контакте с потолком/стеной давать неестественные реакции.
2) Дропы (динамические BrandLogo) плохо взаимодействуют с червями: возможны резкие выталкивания/залипания.
3) Требование: коллизии с неподвижным миром (terrain) должны быть “жёсткими и стабильными”, а коллизии с червями — “мягкими”.

## Goals

- Граната:
  - стабильная коллизия с terrain в узких местах;
  - корректный отскок от отвесного потолка/стены;
  - отскок от червей в ~3 раза слабее, чем от terrain.
- Дропы:
  - мягкое взаимодействие с червями (минимальный “отбив”).
- Черви:
  - добавить “рамку” (12 контактных точек) для использования в столкновениях с гранатами/дропами.

## Current Behavior (code references)

- Grenade vs terrain/entity: `PhysicsEngine.updateProjectile` (ветка `isGrenade`).
- Dynamic BrandLogo vs worm: `PhysicsEngine.handleWormBrandLogoCollisions` (сейчас AABB-приближение).

## Proposed Changes

### 1) Worm contour frame (12 points)

Добавить функцию, генерирующую 12 точек по периметру хитбокса червя (в world-space):

- 4 точки по низу, 4 по верху, 2 слева, 2 справа (равномерно по длине стороны).
- Учитывать, что `worm.x/y` — центр, а `worm.width/height` — размеры хитбокса.

Использование:

- для столкновений “worm ↔ BrandLogo” (динамический дроп)
- потенциально для “worm ↔ grenade” (если понадобится точнее, чем окружность)

### 2) Grenade terrain collision using 8-point ring

Вместо большого `circleOffsets(pr)` для гранаты использовать фиксированное кольцо из 8 оффсетов (N/E/S/W + диагонали) на радиусе `r`:

- снижает шанс “влететь в щель”, т.к. проверяются ключевые направления
- упрощает и стабилизирует оценку контакта в narrow gaps

### 3) Grenade vs worm bounce scaling

При столкновении гранаты с червём:

- использовать “мягкий” коэффициент отскока: `bounceWorm = bounceTerrain / 3`
- опционально усиливать демпфирование тангенциальной компоненты, чтобы граната не “подпрыгивала” от червя.

### 4) BrandLogo vs worm: replace hard AABB push with soft contact resolution

Текущее поведение:

- жёсткая постановка “на верх” и телепорт по X при пересечении.

Новая схема:

- Определить факт пересечения через 12 точек рамки червя:
  - переводить точки в local-space лого (учитывая `logo.angle`)
  - если точка внутри OBB лого — считаем penetration по ближайшей оси
- Применять correction к червю с малым коэффициентом (soft push) и снижать компоненту скорости по нормали.
- Для лого (дропа) реакция минимальная: не отскакивать от червя (почти restitution=0).

## Tuning constants

- `wormFramePoints = 12`
- `grenadeRingPoints = 8`
- `grenadeBounceVsWormScale = 1/3`
- `logoBounceVsWormScale ≈ 0` (только мягкое выталкивание)

## Tests

- Unit test: “grenade does not tunnel through a 1px pocket” (synthetic terrain pattern).
- Unit test: “worm & dynamic logo interaction is stable”:
  - logo падает/скользит по червю без сильных отскоков, без NaN.

