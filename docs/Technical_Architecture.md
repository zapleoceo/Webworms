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
4. **Толкание юнитов (Worm vs Worm Collision)**: Червяки не проходят друг сквозь друга. При пересечении их радиусов применяется вектор выталкивания (Push Force). Толкающий (инициатор) теряет 80% скорости (тяжесть), а толкаемый (цель) получает лишь 20% от импульса, что заставляет игрока "пыхтеть", чтобы сдвинуть врага с места.
5. **Смерть от падения**: Если `worm.y > state.height`, здоровье юнита мгновенно становится `0`. Игра переходит в состояние `GameOver`.

### 3.2 Камера и Оффскрин-Индикаторы (CanvasRenderer.ts)
- **Viewport Translation**: `CanvasRenderer` хранит координаты `cameraX` и `cameraY`. Перед отрисовкой игрового мира вызывается `ctx.translate(-cameraX, -cameraY)`. `InputHandler` обрабатывает события `mousemove`/`touchmove` для изменения координат камеры (Drag-to-pan).
- **Вычисление Индикаторов (Pointers)**: Для каждого червяка проверяется, находится ли он внутри прямоугольника `[cameraX, cameraY, cameraX+canvas.width, cameraY+canvas.height]`. Если нет, вычисляется пересечение отрезка (от центра экрана до координат червяка) с границами экрана, и в этой точке рисуется треугольник и текст (имя юнита).

### 3.3 Оружие (Weapon System)
- **360° Прицел**: `aimAngle` не ограничивается 180 градусами. Угол пересчитывается от 0 до 359. Дуло оружия отрисовывается по окружности. Направление персонажа (`facingRight`) автоматически зависит от угла (cos(angle)).
- **Ударная волна (Shockwave vs Crater)**: 
  - `Projectile.ts` содержит `explosionRadius` (для вырезания дыры) и `shockwaveRadius` (для отталкивания червяков).
- **Спред (Spread)**: `GamePresenter.ts` в методе `fireWeapon` поддерживает цикл для генерации множественных `Projectile` с небольшим разбросом угла (дробовик).

## 4. Схема Базы Данных (Cloudflare D1)

```sql
CREATE TABLE Users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  password_hash TEXT,
  play_time_balance INTEGER DEFAULT 0,
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