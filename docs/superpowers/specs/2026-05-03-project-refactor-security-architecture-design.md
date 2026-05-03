# Webworms: проектный рефакторинг (security → backend → frontend → AI)
Дата: 2026-05-03

## Контекст
Проект — браузерная 2D “артиллерия” (Worms‑like): Vite + TypeScript + Canvas, локальный AI (включая MCTS) и P2P мультиплеер через WebRTC. Бекенд — Cloudflare Workers + D1 + KV + Durable Objects.

Ключевые проблемные зоны:
- Security: “сессия” реализована как `Bearer <user.id>`, пароль хешируется SHA-256 без соли/итераций, генерация токенов через `Math.random`, CORS `*`, клиент логирует ответы auth.
- Backend: огромный if/else роутер, кросс-сечения (auth/cors/errors) размазаны.
- Frontend: `src/main.ts` и `GamePresenter` выполняют слишком много ролей.
- AI: `BotTurnController` — большой state machine с высокой связностью.

## Цели
- Закрыть критические security‑риски без потери функциональности.
- Снизить связность и повысить читаемость, не ломая сборку/тесты.
- Двигаться инкрементально: каждый шаг сопровождается тестами и даёт небольшой, проверяемый дифф.

## Не-цели
- Полный редизайн UX/геймплея.
- Переписывание физики/AI “с нуля”.
- Миграция облачной инфраструктуры (Cloudflare stack остаётся).

## Подход (инкрементальная серия изменений)
Приоритетный порядок:
1) Security/auth
2) Backend архитектура worker
3) Frontend архитектура
4) AI декомпозиция

На каждом этапе:
- обновляются/добавляются тесты;
- выполняется `npm test`;
- изменения сводятся к одному логическому улучшению за PR-дифф (даже если PR не создаётся).

## Этап 1: Security/auth
### 1.1 Сессии вместо `token=userId`
Текущее состояние:
- login возвращает `token = user.id`.
- `Authorization: Bearer <token>` трактуется как первичный ключ пользователя.

Дизайн:
- Добавить D1 таблицу `Sessions`:
  - `token_hash TEXT PRIMARY KEY`
  - `user_id TEXT NOT NULL`
  - `expires_at INTEGER NOT NULL`
  - `created_at INTEGER NOT NULL`
  - индексы по `user_id` и `expires_at` при необходимости.
- При login:
  - генерировать криптостойкий токен (сырой секрет) и срок жизни (например, 30 дней);
  - в D1 хранить только `token_hash` (SHA-256 от токена) и метаданные;
  - в ответ клиенту возвращать сырой токен.
- `requireSessionUser`:
  - брать `Authorization: Bearer <token>`;
  - вычислять `token_hash`;
  - искать сессию, проверять срок годности, затем получать пользователя по `user_id`.

Совместимость:
- На переходный период поддержать legacy‑токены (`user_...`) либо через флаг миграции, либо через fallback‑проверку.

### 1.2 Пароли: PBKDF2 + salt + миграция legacy SHA-256
Текущее состояние:
- `hashPassword` = SHA‑256 (без соли) и прямое сравнение.

Дизайн:
- Новый формат хранения:
  - `password_algo TEXT` (например, `pbkdf2_sha256_v1`),
  - `password_salt TEXT` (base64),
  - `password_hash TEXT` (base64),
  - `password_iters INTEGER`.
- Для существующих пользователей:
  - если `password_algo` пустой и заполнен `password_hash` legacy — трактовать как SHA‑256 hex;
  - при успешном логине пересчитать PBKDF2 и сохранить новый формат.

### 1.3 Генерация секретов
Заменить `Math.random` для `user.id` и verification token на криптостойкую генерацию:
- `crypto.randomUUID()` или `crypto.getRandomValues`.

### 1.4 CORS политика
Заменить `Access-Control-Allow-Origin: *` на allowlist:
- в dev разрешать `http://localhost:*` и текущий origin;
- в prod — конкретный домен(ы) Pages.

### 1.5 Убрать рискованные client logs
Убрать `console.log` ответов login/register, которые могут содержать токены, из `APIClient`.

## Этап 2: Backend worker архитектура
Цель: упростить роутинг, централизовать common logic.

Дизайн:
- Ввести лёгкий router:
  - `route(method, path, handler)` таблицей;
  - поддержку параметризованных путей там, где уже есть `startsWith('/api/maps/')` и т.п.
- Ввести обёртки:
  - `jsonOk(data)`, `jsonError(status, message)`;
  - `withCors`, `withDiag`, `withAuth`, `withAdminAuth`.
- Свести `worker/src/index.ts` к композиции: init DB → route dispatch → unified error handling.

## Этап 3: Frontend архитектура
Цель: уменьшить размер и ответственность `main.ts` и `GamePresenter`.

Дизайн:
- `src/main.ts` разнести на:
  - `app/bootstrap` (инициализация зависимостей),
  - `ui/screens` (auth/menu/loader/gameover/profile),
  - `services` (wakeLock, storage, api, audio),
  - `runtime` (создание presenter/renderer/input/sync).
- `GamePresenter` облегчить:
  - вынести “экономику/баланс времени” из presenter,
  - вынести управление камерой/эффектами в отдельный класс,
  - оставить presenter как оркестратор игрового цикла.

## Этап 4: AI декомпозиция
Цель: уменьшить связность, увеличить тестируемость.

Дизайн:
- Разделить `BotTurnController` на подмодули:
  - `planning` (worker/MCTS/кейс‑либрари),
  - `movement` (walk/jump/rope),
  - `safetyPolicy` (self/friendly/dig),
  - `telemetry` (AIVAI события).
- Публичный интерфейс `BotTurnController` сохранить, чтобы не ломать интеграцию с runtime.

## Риски и меры
- Риск: смена токенов сломает фронт и существующие сессии.
  - Мера: переходная совместимость и автопере-логин при 401.
- Риск: миграция паролей сломает логины.
  - Мера: unit tests на legacy→new upgrade и отказоустойчивые сообщения ошибок.
- Риск: крупные перемещения файлов усложнят diff.
  - Мера: переносить по шагам и запускать тесты после каждого шага.

## Проверки (Definition of Done)
- `npm test` проходит.
- Добавлены тесты на:
  - новый session token flow,
  - истечение сессии,
  - legacy password upgrade.
- `npm run build` проходит.

