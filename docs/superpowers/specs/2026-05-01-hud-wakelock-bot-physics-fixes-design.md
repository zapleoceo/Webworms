# HUD/WakeLock/Bot/Physics Fixes — Design
## Context
- В aivai наблюдается некорректный HUD слева: остаётся "YOU", HP-bar пустой (localTeam = spectator).
- На Android экран всё ещё иногда гаснет в матче (Wake Lock не пере-запрашивается надёжно).
- Коллизии предметов (grenade + airdrops) дают аномальные импульсы (dv) и всплески penetration.
- Периодически заметны микрофризы при “думании” ботов (CPU на main thread).
- Иногда визуально кажется, что бот “атакует могилку” (нужно исключить атаки по мёртвым целям и revalidate цель перед выстрелом).
- Спрайт могилки обрезан неверно — проблема в sprite slicing/кадре, не в offset.

## Goals
- HUD всегда корректно показывает:
  - имена сторон (включая aivai: HARD1/HARD2),
  - текущую сторону хода,
  - полоски HP как сумму HP по всем юнитам команды.
- Wake Lock на Android: максимально надёжно держать экран включённым во время матча.
- Устранить “спайки” у предметов без ломки обычной физики (clamp only-on-anomaly).
- Снизить микрофризы от ботов: убрать вычисления с main thread в aivai.
- Гарантировать, что бот не целится в мёртвого юнита (включая ситуацию, когда цель умерла после планирования).
- Вернуть корректное отображение могилки: исправить frameWidth/frameHeight для grave sprite.

## Non-goals
- Полный редизайн UI или новый протокол multiplayer.
- Полная замена физического движка (только итеративные улучшения).

## Proposed Changes
### 1) HUD: единая модель “кто слева/справа”
Ввести небольшую функцию вычисления HUD-контекста:
- input: mode (training/ai/aivai/friend/random), presenter.localTeam, state.players.
- output:
  - leftTeamKey/rightTeamKey (team1/team2)
  - leftName/rightName (строка)
  - leftIsLocal/rightIsLocal (для подсветки)
- Правила:
  - training: leftName="YOU", rightName="ENEMY"
  - ai: leftName="YOU", rightName="ENEMY {DIFF}"
  - aivai: leftName="HARD1", rightName="HARD2" (или по фактическим настройкам, если доступны)
  - friend/random:
    - если localTeam team1: leftName="YOU", rightName="ENEMY"
    - если localTeam team2: leftName="ENEMY", rightName="YOU" (HUD инвертируется)
- HP-bar считается по teamKey (sum(health)/sum(maxHealth)).

### 2) Wake Lock (Android)
Сделать пере-запрос Wake Lock устойчивым:
- пока матч активен:
  - запрашивать wake lock при старте матча (как сейчас),
  - пере-запрашивать на `visibilitychange`, `pageshow`, `focus`, `fullscreenchange`,
  - держать “user gesture hook” (pointerdown/touchstart) всегда активным, пока wake lock wanted,
  - если `request()` rejected/throws — не “гасить” систему, а оставить хуки и попытаться снова на следующем gesture.

### 3) Grave sprite (исправить обрезку)
- Сейчас `grave*.png` — это лист 60x1200; текущие frameWidth/frameHeight (24x32) неверные и дают “обрезанную” могилку.
- Исправить sprite config для `grave` на frameWidth=60 frameHeight=60 frameCount=1 (берём первый кадр).

### 4) Bot: revalidate цели + anti-stuck
- Revalidate цели перед выстрелом:
  - если targetId отсутствует в aliveEnemies на момент execute_fire/reserve_fire — пересчитать action.
- Anti-stuck движение:
  - если червь в executeMovement “нажимает в стену” и не прогрессирует по позиции N секунд — пересчитать план (сменить направление/выбрать другой moveTo) или перейти к dig-плану.

### 5) Bot thinking: распараллелить (aivai)
Рекомендация: вынести расчёт chooseBotPlan/chooseBotAction в Web Worker для aivai:
- main thread отправляет снапшот (terrain seed/id + worms + botCfg + rng seed),
- worker отвечает выбранным планом/выстрелом,
- если worker не успел — fallback на упрощённый “позиционный” план без тяжёлой симуляции.

### 6) Physics предметов: принципиально
Краткосрочно (сейчас): clamp dv/speed только на аномалиях (уже есть).
Среднесрочно:
- отдельный fixed-step sub-stepping для projectiles/logos (2–4 саб-шага при большой скорости),
- swept collision (swept circle) против terrain, чтобы уменьшить penetration и “выстрел вверх”.

## Validation
- Unit: `npm test`, `npm run build`.
- Manual:
  - aivai: HUD показывает HARD1/HARD2 и корректный HP,
  - Android: экран не гаснет (проверка после lock/unlock, смены вкладки),
  - могилка выглядит корректно (не обрезана),
  - connecting не висит (watchdog cleanup),
  - airdrop/grenade аномалии уменьшаются (dv clamp метка в логах),
  - bot не стреляет в мёртвые цели (лог-проверка).

