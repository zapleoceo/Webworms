# Weapon Behavior Sync + Airdrop Collision Fix (Design)

## Context

Сейчас поведение оружия частично “размазано” между:

- runtime-логикой (создание снаряда, спец-логика blaster burst, физика гранаты);
- AI-симуляцией (TrajectorySim + BotAI, где часть параметров гранаты/оружия может быть захардкожена отдельно).

Из-за этого при изменении поведения оружия (пример: граната stopSpeed/resting) AI может продолжать симулировать старый сценарий, что ухудшает выбор оружия/угла/силы.

Отдельно есть баг коллизии airdrop (brand logo) с червём на стадии “почти остановился/перед штампом в terrain”: резкие импульсы и/или “продавливание” червя на верх.

## Goals

1) Один источник правды для “поведения оружия”, который используется:
   - runtime при создании/обновлении снаряда;
   - AI при симуляции траектории и оценке результата.

2) Исправить коллизию airdrop↔worm:
   - при приземлении на червя дроп “отскакивает”, но импульсы ограничены;
   - червь не телепортируется на верх из-под дропа;
   - исключить “резкие откидывания в сторону” при малой скорости.

## Non-Goals

- Не расширять админку Weapons новыми полями физики (bounce/friction/stopSpeed и т.п.) в рамках этой итерации.
- Не переписывать весь AI/Physics на единую систему — только минимальный слой синхронизации параметров.

## Proposed Architecture

### 1) Shared module: WeaponBehavior

Новый модуль `src/gameplay/WeaponBehavior.ts` (или аналогичный, без зависимости от DOM), который описывает “поведенческий профиль” оружия.

API (черновой):

- `getWeaponBehavior(weapon: Weapon): WeaponBehavior`

Где `WeaponBehavior` включает:

- `projectileRadius: number`
- `mode: 'projectile' | 'grenade'`
- `fuseSeconds?: number`
- `grenade?: { restitution: number; friction: number; stopSpeed: number }`
- `blasterBurst?: { shots: number; interval: number }`

Источник данных:

- базовые параметры берутся из `Weapon` (которые могут приходить из админки через `applyWeaponOverrides`, например `damage`, `explosionRadius`, `fuseSeconds`, `speedModifier` и т.п.);
- спец-параметры поведения (например restitution/friction/stopSpeed для гранаты, burst-структура для blaster) находятся в `WeaponBehavior` и живут рядом с кодом runtime-логики, чтобы изменение поведения было единым.

### 2) Runtime integration

Runtime должен использовать WeaponBehavior для:

- выбора типа снаряда (Projectile vs GrenadeProjectile);
- установки параметров гранаты (bounce/friction/stopSpeed) на объект гранаты при создании;
- (опционально) вычисления параметров burst для blaster в одном месте.

Цель: если меняем “как отскакивает граната” или “когда она засыпает”, меняем только WeaponBehavior и сразу получаем обновление в runtime и AI.

### 3) AI integration

AI должен получать параметры симуляции из WeaponBehavior:

- вместо локальных констант, передавать в `simulateTrajectory`:
  - `mode` и `projectileRadius`
  - `grenade.{restitution, friction, stopSpeed}`
  - `fuseSeconds`

Таким образом симуляция гранаты автоматически следует runtime поведению.

## Airdrop Collision Fix

### Current issues

Коллизия logo↔worm обрабатывается в двух местах:

1) `updateBrandLogos`: при overlap двигает logo относительно worm и добавляет резкий `vx` импульс.
2) `handleWormBrandLogoCollisions`: дополнительно двигает worm (в том числе может поставить worm “на верх”).

Проблема в том, что:

- импульсы vx фиксированные (60/90) и не зависят от скорости/массы → при малой скорости это выглядит как “резкий откидон”;
- условие “stand on top” допускает сценарий, где червь оказывается сверху, хотя был под дропом.

### Desired behavior (chosen)

При приземлении дропа на червя:

- дроп отскакивает (vy становится отрицательным) с ограничением максимального отскока;
- горизонтальный импульс зависит от вертикальной скорости, но строго ограничен;
- логика “worm встал на верх” срабатывает только если worm реально был сверху (а не оказался внутри/снизу).

### Algorithm changes

1) В `updateBrandLogos` при overlap:
   - не телепортировать logo сильными шагами и не давать фиксированный vx;
   - вычислять отскок:
     - `logo.y` ставить на верх worm (минимальная сепарация);
     - `logo.vy = -clamp(abs(vyBefore) * kBounce + vMinBounce, 0, vMaxBounce)`;
     - `logo.vx += sign(logo.x - worm.x) * clamp(abs(vyBefore) * kSide, 0, vMaxSide)`;
     - общий `logo.vx` дополнительно clamp по `[-vMaxLogo, vMaxLogo]`;
     - `logo.angularVelocity *= damp`.

2) В `handleWormBrandLogoCollisions` ужесточить условие “stand on top”:
   - разрешать только если worm действительно был выше верхней плоскости логотипа (по текущей геометрии), а не “предиктом назад”.
   - иначе — только мягкий горизонтальный push.

3) При переходе `wasDynamic && !logo.isDynamic` (момент “готов штампиться”):
   - если overlap с worm — не пытаться штампить и не давать резкий vx;
   - держать `isDynamic=true` и применить тот же “bounce away” алгоритм, чтобы дроп отскочил и освободил место.

## Testing & Verification

- Unit: добавить тест на WeaponBehavior → параметры гранаты, используемые в BotAI, совпадают с runtime profile.
- Manual: воспроизвести падение airdrop на worm при малой скорости и убедиться:
  - нет резкого отлёта;
  - worm не оказывается сверху, если был снизу;
  - dроп отскакивает и затем нормально “садится/штампится”.

