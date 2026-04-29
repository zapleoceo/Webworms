# Техническое Задание (ТЗ) — WebWorms

## 1. Текущее состояние (фактически реализовано)
- **Команды и раунды:** На старте матча создаются 2 команды по 3 червя; активный червь ходит по очереди, ход ограничен таймером.
- **Рендер и спрайты:** Используются оригинальные спрайты Worms через `AnimationController` (32 кадра на прицеливание). Idle/Walk в режиме “пинг‑понг”.
- **Карты:** Список карт грузится без base64, картинка карты запрашивается отдельно; клиент рисует текстуру и кратеры.
- **Мультиплеер:** WebRTC DataChannel + dumb client. Хост считает физику и рассылает state; клиент рендерит.
- **Лоадер:** Экран загрузки с прогрессом (подготовка/загрузка/коннект).

## 2. Оборудование (оружие + инструменты)

### 2.1. Цель
- У каждого червя перед стартом матча задаётся произвольный **loadout** (список `equipmentIds` любой длины).
- В ходе матча червь выбирает активный предмет циклом (action `switch` / клавиша `Q`).
- Оружие и инструменты расширяются добавлением новых модулей без правок “везде по коду”.

### 2.2. Архитектура (MVC)
- **Model**
  - `Worm` хранит `equipmentIds` и `currentEquipmentIndex`, а также state инструмента (например, параметры верёвки).
  - `Weapon.ts` — единый каталог статов оружия (`WEAPONS`).
  - `Projectile` + специализированные модели снарядов (например `GrenadeProjectile`).
- **Presenter**
  - `GamePresenter` управляет вводом, выбором предмета и созданием снарядов.
  - `PhysicsEngine` обновляет физику червей/снарядов/предметов и взрывы.
- **View**
  - `CanvasRenderer` выбирает нужную позу червя по активному предмету и рисует снаряды/верёвку.

### 2.3. Реестр предметов
- Реестр: [EquipmentRegistry.ts](file:///workspace/src/equipment/EquipmentRegistry.ts)
- Каждый предмет имеет `id`, `kind` (`weapon|tool`), и связку спрайтов/анимаций.
- Добавление нового предмета:
  - добавить реализацию в `src/equipment/items/*`
  - зарегистрировать в `EquipmentRegistry.ts`
  - добавить спрайты в `public/sprites/...` и animation key в `CanvasRenderer`

## 3. Реализованные предметы

### 3.1. Базовое оружие (пример: bazooka)
- Стреляет при отпускании `fire` (заряд power).
- Снаряд: обычный `Projectile` (взрыв при столкновении).

### 3.2. Граната (оружие)
- Выбор через `switch`.
- Полёт по дуге, отскоки от ландшафта/объектов.
- Взрыв по таймеру **3 секунды**.
- Код: [GrenadeProjectile.ts](file:///workspace/src/models/GrenadeProjectile.ts), [GrenadeWeapon.ts](file:///workspace/src/equipment/items/GrenadeWeapon.ts), логика fuse/bounce в [PhysicsEngine.ts](file:///workspace/src/presenters/PhysicsEngine.ts#L562-L736).

### 3.3. Верёвка (инструмент хода)
- Выбор через `switch`.
- `fire` (нажатие): зацепиться за ландшафт по направлению прицеливания.
- `fire` (повторно): отцепиться.
- `left/right`: “раскачка” (pumping), `up/down`: изменение длины.
- Не считается “выстрелом оружия” (не обязана завершать ход как weapon).
- Код: [RopeTool.ts](file:///workspace/src/equipment/items/RopeTool.ts), constraint в [PhysicsEngine.ts](file:///workspace/src/presenters/PhysicsEngine.ts#L535-L586), рендер верёвки в [CanvasRenderer.ts](file:///workspace/src/views/CanvasRenderer.ts#L618-L675).

## 4. Бэклог (следующие шаги)
- **UI выбора loadout до матча:** экран/панель для конфигурации `settings.loadout` или `settings.loadouts.team1/team2`.
- **Общий API предметов:** вынести “hooks” (`onSelect/onUse/update/render`) в общий интерфейс, чтобы новые предметы подключались без if/else в presenter/physics.
- **Синхронизация мультиплеера:** уменьшить трафик (дельты/бинарный формат), интерполяция на клиенте.
