# AI Difficulty Grid UI & Admin Bot Settings UX Spec

## Why
Текущий запуск игры с ИИ через кнопку и селектор сложности выглядит “технически”, а не как часть игры. Нужен визуальный выбор сложности через “червяков”, плюс улучшение UX админки BOT-настроек.

## What Changes
- Главный экран:
  - Убрать кнопку `PLAY WITH AI` и селектор `AI: EASY/MEDIUM/HARD`.
  - Добавить блок `User vs AI` с выбором сложности по клику на одного из 3 червяков.
  - Переместить логотип `WEBWORMS` выше, сохранив отступы и не ломая адаптив.
- Hover/Click:
  - В блоке `User vs AI` по hover на червяке картинка меняется (e2→e1, m2→m1, h2→h1).
  - По клику на червяке сразу стартует игра с ИИ выбранной сложности (с loader-экраном).
- Loader:
  - В loader-экране показывать червяка e3/m3/h3 в зависимости от сложности.
  - Под червяком показывать текст прогресса загрузки (существующий текст прогресса переиспользовать).
- HUD в игре:
  - В правом верхнем углу (там где ENEMY) дополнительно показывать уровень сложности.
- Имена червяков:
  - Команда игрока: `my 1`, `my 2`, `my 3`.
  - Команда ИИ: `easy 1..3` / `medium 1..3` / `hard 1..3` в зависимости от выбранной сложности.
- Админка:
  - В разделе BOT Settings: вместо placeholder’ов — подписи (label) к каждому полю.
  - Поля не растягивать на всю строку: оставить место под подпись, сделать аккуратную сетку.
  - Добавить скролл в области настроек, чтобы можно было “достучаться” до любого параметра на мобильных/малых экранах.
  - Кнопка `I` должна показывать подробную русскую справку (уже есть, но привести в соответствие с новыми label’ами и финальным набором параметров).
- Архитектура:
  - Соблюдать разделение ответственности (MVC): DOM/верстка в view-слое, логика выбора/состояния в контроллере/презентере, минимум боковых эффектов в `main.ts`.
  - Не грузить лишние картинки: на главном экране загружать только e2/m2/h2; e1/m1/h1 — лениво при первом hover; e3/m3/h3 — только после клика (во время loader).

## Impact
- Affected specs: UI главного меню, UX загрузчика, HUD матча, нейминг юнитов, UX админки.
- Affected code:
  - Главный экран: [index.html](file:///workspace/index.html), [style.css](file:///workspace/src/style.css), [main.ts](file:///workspace/src/main.ts)
  - Loader: [index.html](file:///workspace/index.html), [main.ts](file:///workspace/src/main.ts)
  - HUD: [index.html](file:///workspace/index.html), [main.ts](file:///workspace/src/main.ts) / [GamePresenter.ts](file:///workspace/src/presenters/GamePresenter.ts)
  - Нейминг юнитов: [GamePresenter.ts](file:///workspace/src/presenters/GamePresenter.ts), [Worm.ts](file:///workspace/src/models/Worm.ts)
  - Админка: [AdminPanel.ts](file:///workspace/src/admin/AdminPanel.ts), [admin.css](file:///workspace/src/styles/admin.css)

## ADDED Requirements
### Requirement: AI Difficulty Selection via Worm Cards
Система SHALL отображать в главном меню блок `User vs AI` с 3 кликабельными червяками для выбора сложности (easy/medium/hard) без отдельного селектора.

#### Scenario: Hover preview
- **WHEN** пользователь наводит мышь на червяка `easy` в блоке `User vs AI`
- **THEN** изображение меняется с `e2` на `e1` (аналогично для medium/hard)
- **AND** до первого hover система не должна загружать `e1/m1/h1` (ленивая подгрузка допустима на hover).

#### Scenario: Start AI game
- **WHEN** пользователь кликает по червяку сложности
- **THEN** запускается игра в режиме `ai` с выбранной сложностью
- **AND** показывается loader-экран с соответствующим червяком `e3/m3/h3`
- **AND** под червяком показывается текст прогресса загрузки.

### Requirement: Loader Shows Difficulty Worm
Система SHALL отображать “червяка загрузки” e3/m3/h3 в зависимости от выбранной сложности, пока игра инициализируется.

### Requirement: HUD Shows Difficulty
Система SHALL отображать уровень сложности (easy/medium/hard) рядом с ENEMY в верхнем правом углу во время матча с ИИ.

### Requirement: Worm Naming for AI Match
Система SHALL именовать червяков:
- Игрок: `my 1..3`
- ИИ: `<difficulty> 1..3`

## MODIFIED Requirements
### Requirement: Main Menu Layout
Главное меню SHALL:
- показывать логотип выше (с отступом, без перекрытия corner-user блока),
- не содержать `PLAY WITH AI` и `AI difficulty select`,
- содержать новый блок `User vs AI` ниже основных кнопок.

### Requirement: Admin Bot Settings Form UX
Раздел BOT в админке SHALL:
- отображать подписи к полям на русском языке,
- иметь компактные поля ввода, не растянутые на всю ширину,
- иметь прокрутку списка настроек на малых экранах,
- сохранять доступ к каждому параметру без горизонтальной прокрутки.

## REMOVED Requirements
### Requirement: Standalone AI Difficulty Select
**Reason**: заменено на визуальный выбор червяка.
**Migration**: значение сложности теперь задаётся кликом по червяку и сохраняется в existing storage (если используется) для повторного старта.
