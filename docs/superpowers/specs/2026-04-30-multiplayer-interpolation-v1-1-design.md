# Multiplayer v1.1 — Snapshot Interpolation

## Цель

- Убрать “телепорты”/джиттер в сетевой игре без client-side prediction.
- Сохранить P2P WebRTC host-authoritative модель и низкую нагрузку.

## Решение

### Snapshot buffer

- На клиенте хранить буфер из последних 2–3 `sync` снапшотов:
  - `{ recvTimeMs, seq, players[], projectiles[], meta }`
- Рендерить состояние не “последним полученным”, а интерполированным в момент времени:
  - `renderTime = nowMs - 100ms`

### Интерполяция

- Для `players[i]`: линейная интерполяция `x/y/vx/vy` между `A` и `B`, остальные поля (hp, aim, rope, equipment) брать из `B`.
- Для `projectiles`: работать по `id` (`netId` от хоста):
  - если `id` есть в A и B — lerp `x/y/vx/vy`
  - если только в A или только в B — использовать доступное состояние (без lerp)
  - удалять объект после того, как он пропал из обеих последующих пар снапшотов.
- `craters` применять немедленно при приёме снапшота (как event), не интерполировать.

### Встраивание в game loop

- `GamePresenter.update` в режиме `!isHost` вызывает callback `onClientTick(dt)`.
- `MultiplayerController` реализует `onClientTick`, который прогоняет интерполяцию и обновляет `presenter.state`.

## Параметр

- `INTERP_DELAY_MS = 100`

## Критерии готовности

- В сетевой игре движения червя/пуль визуально плавные при умеренном джиттере.
- Нет резких “ресетов” траекторий пуль (обновление по id).
- Не ухудшается responsiveness ввода (инпут остаётся host-authoritative).

