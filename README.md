# 40kHeadquarters MVP (Core + Browser Client)

Проект состоит из двух частей:

- `src/` - сервер симуляции, REST API и WebSocket.
- `client/` - браузерный клиент на Vite + PixiJS.

Данные игры хранятся в file-backed NoSQL snapshot: `data/db.json`.

## Быстрый запуск

1. Установить зависимости:

```bash
npm install
```

2. Запустить сервер и клиент:

```bash
npm run dev:game
```

3. Открыть в браузере:

- Игра: `http://localhost:5173/`
- Админка: `http://localhost:5173/admin.html`

## Архитектура сервера

Сервер декомпозирован на модули:

- `src/server.ts` - orchestration, маршрутизация API/WS, связывание модулей.
- `src/server/contracts.ts` - серверные типы/DTO (auth/admin payloads, session context).
- `src/server/seed.ts` - начальный state и seed-аккаунты.
- `src/server/transport.ts` - JSON/CORS/bearer/WS transport-хелперы.
- `src/server/visibility.ts` - фильтрация видимости state/resolution для сессии.
- `src/server/immediateDiplomacy.ts` - мгновенная дипломатия и pending alliance proposals.

Игровые системы (turn resolve) лежат в `src/systems/*` и `src/turn/resolveTurn.ts`.

## Документная БД

Используется snapshot-файл `data/db.json`.

Хранится:

- `gameState` (карта, игроки, флоты, планеты, ход/фаза)
- `accounts` (логины/пароли/роли)

Загрузка выполняется при старте сервера, сохранение — после админских CRUD-операций и после `resolveTurn()`.

## Авторизация

Если БД создаётся с нуля, доступны дефолтные аккаунты:

- `admin / admin123` (role: `admin`)
- `p1 / p1` (role: `player`, `playerId: p1`)
- `p2 / p2`
- `p3 / p3`

После логина клиент подключается к WebSocket с bearer-токеном.

## Admin API

### Auth

- `POST /api/login`
- `GET /api/me`
- `POST /api/logout`

### Players

- `GET /api/admin/players`
- `POST /api/admin/players`
- `PUT /api/admin/players/:id`
- `DELETE /api/admin/players/:id`

### Planets

- `GET /api/admin/planets`
- `POST /api/admin/planets`
- `PUT /api/admin/planets/:id`
- `DELETE /api/admin/planets/:id`

### Fleets

- `GET /api/admin/fleets`
- `POST /api/admin/fleets`
- `PUT /api/admin/fleets/:id`
- `DELETE /api/admin/fleets/:id`

### Relations (Wars / Alliances)

- `GET /api/admin/relations`
- `POST /api/admin/relations` (`type: "WAR" | "ALLIANCE"`)
- `DELETE /api/admin/relations` (`type: "WAR" | "ALLIANCE"`)

## Скрипты

- `npm run dev` - demo без браузера
- `npm run dev:server` - API + WS сервер
- `npm run dev:client` - браузерный клиент
- `npm run dev:game` - сервер + клиент
- `npm run check` - TypeScript check
- `npm run build:core` - сборка server/core в `dist/`
- `npm run build:client` - сборка клиента в `dist/client`
- `npm run build` - полная сборка