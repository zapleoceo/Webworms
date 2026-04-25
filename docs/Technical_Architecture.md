## 1. Архитектурный дизайн (Полный стек Cloudflare)

```mermaid
flowchart TD
    subgraph Frontend (Vite + Canvas)
        UI["UI (Lobby, Auth, Friends, Styled Mobile Controls)"]
        GL["Game Logic (Momentum Physics, 360° Aiming)"]
        WR["WebRTC (P2P Match, Turn Timer Sync)"]
        
        subgraph Graphics (CanvasRenderer)
            CAM["Camera Matrix (Pan / Translate)"]
            CL["Cached Landscape (destination-out)"]
            PL["Particle Layer (Shockwaves, Smoke)"]
            UL["Unit Layer (Worms)"]
            EL["Equipment Layer (Armor, Hats)"]
            UI["Overlay (Off-screen pointers)"]
        end
        
        subgraph Audio (SoundManager)
            SFX["8-bit Synthesizer (Jump, Pew, Boom)"]
        end
    end
    subgraph Cloudflare Pages Functions (Backend)
        API["REST API (Auth, Matchmaking, Friends)"]
        WH["Payment Webhook (Stripe/Telegram)"]
    end
    subgraph Cloudflare D1 (Database)
        U[("Users (PlayTime Balance)")]
        F[("Friends (Status)")]
        T[("Transactions")]
    end
    
    UI <--> API
    API <--> U
    API <--> F
    WH --> T
    T --> U
    GL <--> WR
    GL --> Graphics
    GL --> Audio
```

## 2. Описание технологий и Биллинг
- Фронтенд: TypeScript + HTML5 Canvas (Vite).
- Бэкенд: Cloudflare Pages Functions (Serverless).
- База данных: Cloudflare D1 (Edge SQLite).
- Сеть: Trystero (или кастомный WebRTC).
- Звук: Web Audio API (Oscillators, BiquadFilters).
- Платежи: Безопасный Webhook-эндпоинт (напр., `/api/webhooks/stripe`). Подпись платежа валидируется на стороне Cloudflare, после чего баланс `play_time_balance` пополняется на 3600 секунд.

## 3. Физический движок, Камера и Вооружение (Доработки)

### 3.1 Физика (PhysicsEngine.ts)
1. **Гравитация (Gravity) и Трение**: Параметры (напр., 300 px/s²) больше не хардкодятся, а извлекаются из `state.matchSettings`. Это позволяет применять кастомные настройки для разных мультиплеерных раундов.
2. **Инерция и Склоны (Momentum Slopes)**:
   - Если склон крутой (нормаль > 50°), червяк пытается залезть.
   - Проверяется горизонтальная скорость `Math.abs(vx)`. Если скорость высокая (>150), червяк по инерции "забегает" на стенку (теряя скорость).
   - Если скорость низкая, червяк отскакивает и съезжает вниз.
3. **Прыжки (Jump)**: Высота прыжка уменьшена (сила -150 вместо -250). Управление в воздухе (Air Control) позволяет накапливать горизонтальную скорость.
4. **Толкание юнитов и Взаимодействие с Пропами (Worm vs Prop Collision)**: Червяки не проходят друг сквозь друга. При пересечении их радиусов применяется вектор выталкивания (Push Force). Толкающий теряет скорость.
   - Аналогичная коллизия работает для `Worm vs PhysicsProp`. Объекты не пропускают червяков сквозь себя.
   - **Кинетический урон (Kinetic Damage)**: В методе `handleWormPropCollisions` вычисляется относительная скорость столкновения `relSpeed = Math.sqrt(relVx*relVx + relVy*relVy)`. Если скорость больше `100`, обе стороны (червяк и объект) получают урон от удара. Урон червяка жестко ограничен: `maxDamage = 24`, что чуть меньше базового урона ракеты (`25`).
   - **Отдача (Knockback vs Mass)**: При взрыве снаряда вычисляется вектор отбрасывания объектов `(dx/norm) * (50/prop.mass)`. Так как объекты тяжелее червяков (у червяка `mass=1`, у камня `mass=2.0`), они отлетают от взрывной волны значительно слабее.
   - **Урон от падения Объектов**: Если `prop.vy > 200` при касании земли, объект наносит урон сам себе `prop.takeDamage(...)`.
5. **Смерть от падения**: Если `worm.y > state.height`, здоровье юнита мгновенно становится `0`. Игра переходит в состояние `GameOver`.
6. **Система Брони (Defense Modifier)**: Все вызовы функции `takeDamage(amount)` теперь проходят через формулу: `actualDamage = amount * (1 - this.defense)`. Значение `defense = 0.4` означает 40% поглощения урона.

### 3.2 Камера и Оффскрин-Индикаторы (CanvasRenderer.ts)
- **Viewport Translation**: `CanvasRenderer` хранит координаты `cameraX` и `cameraY`. Перед отрисовкой игрового мира вызывается `ctx.translate(-cameraX, -cameraY)`. `InputHandler` обрабатывает события `mousemove`/`touchmove` для изменения координат камеры (Drag-to-pan).
- **Вычисление Индикаторов (Pointers)**: Для каждого червяка проверяется, находится ли он внутри прямоугольника `[cameraX, cameraY, cameraX+canvas.width, cameraY+canvas.height]`. Если нет, вычисляется пересечение отрезка (от центра экрана до координат червяка) с границами экрана, и в этой точке рисуется треугольник и текст (имя юнита).

### 3.3 Ландшафт и Генерация (TerrainGenerator.ts)
- **Многоуровневая Архитектура Генератора**:
  1. *Нижний фундамент*: Генератор заполняет нижние 20-30% массива (`y` от 70% до 100%) плотным Метеоритным камнем, гарантируя, что под полем всегда есть основание.
  2. *Базовый рельеф (1D Noise)*: Поверх фундамента накладывается кривая, сгенерированная шумом Перлина (Perlin Noise), формируя холмы и впадины.
  3. *Парящие острова (2D Noise Threshold)*: В верхних 50% карты алгоритм проходит двумерным шумом (Simplex Noise). Если значение шума `> Threshold`, пиксель становится "Лунным грунтом", образуя органичные острова.
  4. *Структурные шаблоны*: Функция может "впечатать" в массив заранее заданные шаблоны (матрицы), например, мост или квадратную платформу.

### 3.4 Оружие (Weapon System)
- **360° Прицел**: `aimAngle` не ограничивается 180 градусами. Угол пересчитывается от 0 до 359. Дуло оружия отрисовывается по окружности. Направление персонажа (`facingRight`) автоматически зависит от угла (cos(angle)).
- **Ударная волна и Взаимодействие с материалами**: 
  - `Projectile` содержит матрицу множителей `materialDamageMultipliers` (например, `{ 1: 1.0, 2: 0.2 }`), которая определяет, насколько хорошо взрыв пробивает разные материалы.
  - При взрыве (`explode`) в `PhysicsEngine` радиус разрушения (кратер) рассчитывается индивидуально для каждого пикселя в зависимости от его материала.
- **Спред (Spread)**: `GamePresenter.ts` в методе `fireWeapon` поддерживает цикл для генерации множественных `Projectile` с небольшим разбросом угла (дробовик).

### 3.5 Звуковой Движок (SoundManager.ts)
В классе `SoundManager` реализованы методы для динамического синтеза (AudioContext):
- `playJump()`: Использует `OscillatorNode` типа `sine`, частота экспоненциально возрастает (с 300 до 600 Гц) за 0.15с.
- `playHurt()`: `OscillatorNode` типа `square` (квадратная волна, 8-битный звук) с модуляцией частоты и быстрым затуханием (0.1с).
- `startFalling()` / `stopFalling()`: Если червяк имеет `vy > 150`, включается непрерывный `Oscillator` с убывающей частотой (эффект доплера). При касании земли он выключается.
- `playHeavyImpact()`: Если `vy > 300` в момент коллизии в `PhysicsEngine.ts`, `SoundManager` генерирует шум (BufferSource), пропущенный через `BiquadFilter` типа `lowpass` с высокой громкостью, имитируя глухой удар тяжелого тела о землю.

## 4. Схема Базы Данных (Cloudflare D1)

```sql
CREATE TABLE Users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  play_time_balance INTEGER DEFAULT 3600,
  last_daily_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
  referred_by TEXT, -- Foreign Key to Users.id (Parent / Level 1)
  matches_played INTEGER DEFAULT 0,
  matches_won INTEGER DEFAULT 0,
  total_damage_dealt INTEGER DEFAULT 0,
  total_kills INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Friends (
  user_id TEXT,
  friend_id TEXT,
  status TEXT,
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE MATCH_SETTINGS (
  id TEXT PRIMARY KEY,
  turn_time_limit INTEGER,
  allowed_weapons TEXT,
  gravity_multiplier REAL DEFAULT 1.0,
  friction_multiplier REAL DEFAULT 1.0
);
```

### 4.3 Оптимизация Реферальной Пирамиды (без рекурсии)
Для соблюдения лимитов и производительности D1 расчет бонусов происходит **строго в момент регистрации** (Batch Transaction).
- Игрок (С) переходит по ссылке `?ref=B`. Игрок B (родитель), Игрок A (дедушка).
- Воркер выполняет транзакцию:
  1. `INSERT INTO Users (id, email, referred_by) VALUES ('C', '...', 'B');`
  2. Начисление приветственного бонуса себе: `UPDATE Users SET play_time_balance = play_time_balance + 3600 WHERE id = 'C';`
  3. Начисление родителю (Level 1): `UPDATE Users SET play_time_balance = play_time_balance + 3600 WHERE id = 'B';`
  4. Поиск дедушки (Level 2): `SELECT referred_by FROM Users WHERE id = 'B';` -> находит 'A'.
  5. Начисление дедушке (Level 2): `UPDATE Users SET play_time_balance = play_time_balance + 900 WHERE id = 'A';`
Таким образом, нам не нужно каждый раз запускать тяжелые запросы с `JOIN`, чтобы узнать размер реферального дерева.

### 4.4 Авторизация (Google OAuth / Magic Link)
- Фронтенд: Перенаправляет пользователя на `https://api.game.com/auth/google`.
- Бэкенд (Cloudflare Worker): Отрабатывает OAuth 2.0 flow, получает email пользователя от Google.
- Проверяет базу `Users` по `email`. Если пользователя нет — регистрирует (проверяя наличие куки `ref` для реферальной системы). Выдает подписанный JWT-токен.
- Вход по паролям отсутствует для повышения безопасности и простоты регистрации.

### 4.5 Суточные лимиты и Grace Period
- При запросе к API воркер сравнивает `last_daily_reset` с текущей датой. Если наступили новые сутки, а баланс `play_time_balance < 3600`, воркер обновляет баланс до `3600` и ставит `last_daily_reset = NOW()`.
- Во время P2P-матча, клиенты проверяют оставшееся время. Если оно истекает, игра не прерывается (Grace Period). Бэкенд позволяет балансу уйти в минус (например, `-120 секунд`), который будет списан при следующем пополнении или сбросе.