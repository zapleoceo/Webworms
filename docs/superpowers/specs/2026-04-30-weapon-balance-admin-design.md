## Цель

1) Сделать оружие примерно равноценным по “полезности” (DPS + контроль + надёжность) при разных стилях использования.  
2) В админке сделать удобный редактор каждого оружия (параметры + спрайты) и вывести общий показатель качества (score).

## Текущее состояние (проблемы)

- `chargeSpeed` в модели есть, но в игре фактически не влияет на зарядку (заряд общий константой).
- `knockback` не влияет на червей (только на props), поэтому “контроль” не балансируется статами.
- `projectilesPerShot` даёт почти бесплатное усиление, т.к. каждый снаряд несёт полный `damage/radius`.
- У `blaster` скорость снаряда захардкожена и игнорирует `speedModifier`.

## Набор параметров оружия

Обязательные параметры (уже есть):
- damage
- explosionRadius
- knockback
- windMultiplier
- spread (deg)
- projectilesPerShot
- cooldown (sec)
- chargeSpeed (mult)
- speedModifier

Новый параметр:
- maxRange (px) — максимальная дальность полёта/луча (для балансировки “дальности” независимо от скорости).

## Изменения в геймплее (чтобы статы стали управляемыми)

1) Зарядка:
- скорость зарядки = `baseChargeRate * weapon.chargeSpeed`, где baseChargeRate = 100 power/sec как сейчас.
- `chargeSpeed=0` => instant (power не накапливается, выстрел по отпусканию сразу с power=100 или с минимальной логикой).

2) Knockback по игрокам:
- заменить захардкоженное отбрасывание `150 * damageRatio` на `weapon.knockback * damageRatio` (с ограничением min/max).

3) Multi-projectile:
- `damagePerProjectile = damage / projectilesPerShot` (или более мягко: `/ sqrt(P)`), чтобы дробь не умножала урон линейно.

4) Max range:
- projectile получает `rangeRemaining = maxRange` и уменьшается на пройденную дистанцию; при исчерпании — explode (или deactivate для “луча”).

## Score (показатель качества)

Считать score 0..100 (чем выше, тем сильнее/надёжнее):

- `powerRef = 60`
- `chargeTime = (powerRef/100) / max(eps, chargeSpeed)` (если chargeSpeed=0 => 0)
- `cooldownEffective = cooldown * max(0.2, powerRef/100)` (как в текущей игре)
- `cycleTime = chargeTime + cooldownEffective`

Надёжность попадания:
- `hitFactor = clamp01(1 - 0.55*spreadNorm - 0.35*windNorm + 0.25*speedNorm)`

AoE:
- `aoeFactor = 0.35 + 0.65*radiusNorm`

DPS-оценка:
- `rawDps = (damageAdj * projectilesPerShot * hitFactor * aoeFactor) / max(0.15, cycleTime)`
- `damageAdj = damage / max(1, projectilesPerShot)` (если включён делёж урона)

Utility:
- `utility = 0.25*knockbackNorm + 0.10*radiusNorm + 0.10*rangeNorm`

Variance penalty:
- `variancePenalty = 0.6*spreadNorm + 0.4*projCountNorm`

Итог:
- `score = normalize01(rawDps)*0.75 + utility*0.25 - 0.15*variancePenalty`
- `score100 = round(score*100)`

## Админка: UX редактора оружия

В разделе Weapons:

Левая колонка:
- список оружий (иконка, имя, score, небольшой бейдж)
- поиск/фильтр (опционально)

Правая колонка (панель выбранного оружия):
- preview блока: icon + projectile sprite
- upload/replace кнопки
- формы параметров (группы):
  - Damage/AoE
  - Tempo (cooldown/chargeSpeed)
  - Accuracy (spread/wind/speed)
  - Range (maxRange)
  - Multi-shot (projectilesPerShot)
- блок “Derived”:
  - cycleTime, estimatedRange, rawDps, score100
- кнопки:
  - Save
  - Reset (reload from server)
  - Duplicate (создать копию как новое оружие)

Таблица снизу оставить только как “all weapons overview” или убрать в пользу списка.

## Тестирование

- Unit-тест score-функции на стабильность (проверка монотонности: рост damage повышает score, рост cooldown снижает score).
- Smoke: создать/обновить оружие в админке, проверить, что в игре применяется chargeSpeed/knockback/range.

