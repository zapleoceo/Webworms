## 1. Архитектурный дизайн (MVP + Performance Mode)

```mermaid
flowchart TD
    subgraph View (Rendering)
        C["Main Canvas"]
        O["Offscreen Terrain Canvas (Cache)"]
        S["SoundManager (Pre-cached Buffers)"]
    end
    subgraph Presenter (Logic)
        GP["GamePresenter (Main Loop)"]
        PE["PhysicsEngine (Calculations)"]
    end
    subgraph Model (Data)
        GS["GameState"]
        L["Landscape (Physics Grid + Crater Queue)"]
    end
    
    GP --> PE
    PE --> GS
    GP --> C
    O -- "drawImage (60 FPS)" --> C
    L -- "newCraters queue (Event)" --> O
```

## 2. Описание технологий
- Фронтенд: TypeScript + HTML5 Canvas API
- Сборка: Vite + Обфускатор
- Оптимизации: 
  - `CanvasRenderingContext2D.globalCompositeOperation = 'destination-out'` (Сверхбыстрое вырезание кратеров)
  - `AudioContext.createBuffer` (Кэширование генеративного 8-битного шума в памяти)

## 3. Решение проблемы быстродействия
При одновременном взрыве нескольких ракет предыдущая версия перерисовывала 480 000 элементов массива `Landscape` в `Canvas`. 
Новое архитектурное решение:
1. `Landscape` (Model) отвечает только за физический массив `Uint8Array`.
2. При взрыве `Landscape` добавляет координаты взрыва в очередь `newCraters`.
3. `CanvasRenderer` (View) читает очередь `newCraters` перед отрисовкой кадра.
4. `CanvasRenderer` использует аппаратное ускорение `destination-out` для вырезания круга на скрытом холсте `terrainCanvas`, после чего очередь очищается.
5. `SoundManager` генерирует массив белого шума 1 раз при `init()` и переиспользует его.

## 4. Этап 2: Сетевая Архитектура
Планируемый стек для мультиплеера:
- База данных: Cloudflare D1 (SQL)
- Матчмейкинг: Cloudflare Pages Functions (REST API)
- Коммуникация: WebRTC (DataChannels) через Trystero или кастомный сигнальный сервер (Cloudflare KV).