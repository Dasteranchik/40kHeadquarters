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

- `gameState` (карта, игроки, Юниты, Планеты, Станции, Кораблекрушения,
  Аномалии, Магазины, обнаружение, таймер, idempotency и Audit)
- `accounts` (логины/пароли/роли)
- `sessions` (серверные сессии)
- `turnSnapshots` (ограниченная история START/END снимков ходов для rollback)

Старый `data/db.json` автоматически нормализуется: новые коллекции, теги,
инвентари, Магазины, таймер, detection/audit/processed commands получают
безопасные значения по умолчанию. Ручное удаление snapshot не требуется.

Сервер остаётся источником истины для симуляции и fog-of-war. Фазы идут только
в порядке `PLANNING -> RESOLUTION -> UPDATE -> PLANNING`. PLANNING по умолчанию
завершается через 60 минут; длительность задаётся серверной переменной
`TURN_DURATION_MS`. Сохранённый deadline восстанавливается после перезапуска.

## Игровые сущности и механики

- Один гекс может содержать несколько Планет, Станций, Кораблекрушений,
  Аномалий, Флотов и Армий; общий серверный запрос выполняет
  `getObjectsAtHex(state, coord)`.
- `Tile.planetId` сохранён только как compatibility-field старого snapshot;
  новые системы работают по координатам коллекций объектов.
- Юниты и конфигурируемые объекты поддерживают `STEALTH`; Detection хранится
  отдельно для каждого игрока. Собственные Юниты видны всегда, остальные —
  только после обнаружения. `EXACT_AUSPEX` переключает оценочные параметры на
  точные.
- До выплаты десятины Планета генерирует ресурсы в `rawStock`, после выплаты —
  в `shop.resources`. RAID берёт добычу из Магазина и не влияет на десятину.
- Магазин принимает явный состав оплаты Юнита и поддерживает три утверждённых
  направления обмена. `PRODUCT -> RAW` отклоняется до решения `DEC-016`.
- Artifact — уникальный экземпляр с атомарным переносом и безопасным registry
  эффектов; Knowledge копируется без дублей. При уничтожении Юнита эти предметы
  попадают в Shipwreck, а RAW/PRODUCT уничтожаются.
- Немедленные WebSocket-команды используют `commandId`; обработанные результаты
  сохраняются в ограниченной истории. Административные и критичные предметные
  операции фиксируются в отдельном persisted Audit Log.

## Авторизация

Если БД создаётся с нуля, доступны дефолтные аккаунты:

- `admin / admin123` (role: `admin`)
- `p1 / p1` (role: `player`, `playerId: p1`)
- `p2 / p2`
- `p3 / p3`

После логина сервер выставляет `HttpOnly` session cookie, и клиент использует его для HTTP/API и WebSocket.

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

### World objects, Shop and reliability

- `GET|POST /api/admin/stations`
- `PUT|DELETE /api/admin/stations/:id`
- `GET /api/admin/shipwrecks`
- `GET|POST /api/admin/anomalies`
- `PUT /api/admin/shops/:PLANET|STATION/:id`
- `POST /api/admin/items`
- `DELETE /api/admin/artifacts/:id`
- `GET /api/admin/audit`
- `GET /api/admin/turn-snapshots`
- `POST /api/admin/turn-snapshots/:id/rollback`
- `POST /api/admin/end-turn`

Rollback разрешён только администратору, только из текущей фазы PLANNING и
только к снимку, который сам находится в PLANNING. После восстановления pending
команды очищаются, создаётся новый deadline и состояние рассылается клиентам.
Persisted Audit и история обработанных `commandId` при этом не откатываются:
это сохраняет журнал действий и блокирует поздний повтор старой команды.

## Скрипты

- `npm run dev` - demo без браузера
- `npm run dev:server` - API + WS сервер
- `npm run dev:client` - браузерный клиент
- `npm run dev:game` - сервер + клиент
- `npm run check` - TypeScript check
- `npm test` - тесты на встроенном `node:test` через `tsx`
- `npm run build:core` - сборка server/core в `dist/`
- `npm run build:client` - сборка клиента в `dist/client`
- `npm run build` - полная сборка
