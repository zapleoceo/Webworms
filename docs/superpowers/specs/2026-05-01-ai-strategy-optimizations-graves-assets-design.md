# AI Strategy Optimizations + Graves Asset Fix (Design)

## Context

1) В AIVAI логах много ходов “без результата” и заметен френдлифаер.
2) Есть кейсы, когда бот упирается в невыгодное положение (стена/яма/низ карты) и продолжает делать слабые действия.
3) Могилки в некоторых сессиях рисуются fallback-рендером (прямоугольник с текстом), хотя спрайты существуют.

## Goals

- Уменьшить долю пустых выстрелов и френдлифаера.
- Заставить бота чаще улучшать позицию перед стрельбой (подойти ближе, найти более открытый угол).
- Убрать повторение бессмысленных выстрелов/планов при близком состоянии.
- Исправить загрузку спрайтов могилок во всех режимах хостинга (root/subpath).

## Proposed Changes

### 1) Grave sprites: stable URL

Проблема: путь вида `/sprites/...` зависит от `BASE_URL` (если игра хостится не в корне домена, а в подкаталоге).

Решение:

- Добавить утилиту `assetUrl(relPath)` = `import.meta.env.BASE_URL + relPath` (нормализация слешей).
- В `spawnGrave` использовать `assetUrl('sprites/Misc/graveN.png')`.

### 2) Shot Memory (anti-repeat + anti-dead-shot)

Идея: хранить для каждого бота историю последних N “кандидатных выстрелов” в квантизированном виде и их исход.

- Shot signature:
  - `weaponId`
  - `angleBin` (например 2°)
  - `powerBin` (например 5%)
  - `facing`
- State key (грубая похожесть условий):
  - shooter position bins (например 32px)
  - closest enemy position bins (например 64px)

Outcome:
- `enemyHpDelta` (сколько снялось)
- `allyHpDelta`

Использование:
- В scoring (в воркере) добавлять штраф:
  - если такой же shot signature в похожем state key уже был “пустой” → penalty;
  - если был френдлифаер → большой penalty/запрет.

### 3) pHit(distance): expected damage вместо “идеального попадания”

Добавить к scoring модель вероятности попадания, зависящую от дистанции и сложности выстрела:

- `pHit = exp(-(distance / scale)^2)`, где `scale` зависит от difficulty (`aimErrorPct`, `powerErrorPct`) и weapon.spread.
- `expectedDamage = baseDamage * falloff * pHit`.
- Дополнительно: небольшой штраф за очень дальние выстрелы даже если expectedDamage похожий, чтобы бот охотнее подходил.

### 4) Expected Friendly Fire penalty

Сейчас “unsafe” по союзникам — это жёсткий фильтр. Добавить ещё soft penalty:

- Оценить ожидаемый урон союзникам по тому же falloff вокруг точки impact.
- Увести score вниз пропорционально `expectedFriendlyDamage`.

### 5) Multi-stage turn planning (move → replan → fire)

Вместо “план один раз в начале”:

- Stage A: воркер планирует `moveTo + action` как сейчас.
- Stage B: если бот достиг moveTo рано или застрял/условия сильно изменились, делаем `replan` в воркере с оставшимся временем и текущей позицией.
- Stage C: стрельба берёт `plan.action`, если он валиден; иначе лёгкий fallback.

## Notes / Constraints

- Shot Memory и pHit должны быть одинаково доступны воркеру (поэтому передаются в payload воркера).
- Изменения не должны увеличивать нагрузку на main thread: все тяжёлые переборы остаются в воркере.

