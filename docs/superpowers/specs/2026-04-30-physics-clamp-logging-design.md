# Physics Spike Clamp + AIVAI Log Optimization — Design
## Context
- В aivai-логах встречаются аномальные импульсы:
  - grenade_bounce_spike (dv ~ 500–630)
  - airdrop_impulse_spike (dv до сотен)
- Также обнаружен кейс: blaster выстрел “не появляется” (burst теряется из-за перехода хода до processActiveInputs).
- Логи aivai получаются крупными из-за частого physics_sample с большими массивами.

## Goals
- Убрать только “спайки” (energy injection), не меняя обычное поведение столкновений.
- Исправить blaster burst так, чтобы он гарантированно спавнил пули в aivai/MP режиме.
- Уменьшить размер aivai-логов без потери диагностической ценности.

## Non-goals
- Не менять базовую физику и баланс оружия (кроме редких clamp-срабатываний).
- Не вводить новую систему сериализации/сжатия.

## Proposed Changes
### 1) Grenade spike clamp (PhysicsEngine)
- После bounceOnNormal считать dv относительно vBefore.
- Если dv выше порога, “подрезать” delta-v до cap, не трогая направление движения радикально.
- В trace projectile-collision добавить флаг clamped только когда применён clamp.

### 2) Airdrop spike clamp (AirdropPhysics)
- После solver iterations считать dv относительно v0.
- Если dv выше порога, ограничить delta-v (и, вторично, абсолютную скорость) cap’ом.
- В trace airdrop_contact добавить флаг clamped только когда применён clamp.

### 3) Blaster burst reliability (GamePresenter)
- Считать burst как “не stable” для логики nextTurn:
  - пока blasterBurstRemaining > 0, turn не должен завершаться как stable.
- Это гарантирует spawnSingleProjectile из burst цикла.

### 4) AIVAI log size
- Physics sampling interval сделать адаптивным:
  - 10Hz при наличии projectiles или активных airdrop logos
  - 3–5Hz когда мир “пустой”
- Ограничить props в physics_sample до top-N по скорости (N=8), чтобы не раздувать лог.

## Validation
- Unit: общий прогон `npm test` и `npm run build`.
- Log regression: на in_pc проверить:
  - исчезновение “выстрел без снаряда” у blaster
  - уменьшение dv спайков (anomaly остаётся, но dv становится capped)
  - уменьшение размера итогового json

