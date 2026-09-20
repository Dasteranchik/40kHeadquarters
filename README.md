# 40kHeadquarters

MVP пошаговой стратегии на гексагональной карте во вселенной Warhammer 40,000.
Сервер управляет симуляцией, фазами хода, видимостью, дипломатией и сохранением;
браузер отвечает за интерфейс, PixiJS-карту, ввод приказов и отображение fog-of-war.

## Технологический стек

- сервер: TypeScript, `node:http`, `ws`;
- клиент: Vite, PixiJS, vanilla TypeScript/DOM/CSS;
- хранение: единый JSON snapshot `data/db.json`;
- тесты: встроенный `node:test` через `tsx`.

Express, React, SQL и ORM в проекте не используются.

## Быстрый запуск

Требуются Node.js 20+ и npm.

1. Установите зависимости:

```bash
npm install
```

2. При первом запуске задайте учётные данные администратора. Проект сам не
   загружает `.env`, поэтому переменные должны быть установлены в терминале,
   службе или конфигурации контейнера.

PowerShell:

```powershell
$env:BOOTSTRAP_ADMIN_USERNAME = "admin"
$env:BOOTSTRAP_ADMIN_PASSWORD = "your-long-random-password"
npm run dev:game
```

bash/zsh:

```bash
BOOTSTRAP_ADMIN_USERNAME=admin \
BOOTSTRAP_ADMIN_PASSWORD='your-long-random-password' \
npm run dev:game
```

Пароль должен содержать от 12 до 256 символов. После успешного создания и
сохранения первого администратора bootstrap-переменные для следующих запусков
не требуются. Не храните реальный пароль в истории shell или репозитории.

3. Откройте:

- игру: `http://localhost:5173/`;
- панель администратора: `http://localhost:5173/admin.html`;
- API и WebSocket: `http://localhost:8080` и `ws://localhost:8080`.

Новый seed содержит игровую карту, фракции, демонстрационных игроков и объекты,
но не создаёт известных паролей или player-аккаунтов. Учётные данные игроков
задаются администратором через панель управления.

## Конфигурация сервера

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `PORT` | `8080` | Порт HTTP API и WebSocket |
| `TURN_DURATION_MS` | `3600000` | Продолжительность фазы PLANNING в миллисекундах |
| `BOOTSTRAP_ADMIN_USERNAME` | — | Логин первого администратора |
| `BOOTSTRAP_ADMIN_PASSWORD` | — | Пароль первого администратора, минимум 12 символов |

Клиент по умолчанию подключается к порту `8080` на текущем hostname. Для
отладки адреса можно передать query-параметрами:

```text
http://localhost:5173/?api=http://localhost:8080&ws=ws://localhost:8080
```

Админка поддерживает параметр `api`.

## Игровой цикл и серверная авторитетность

Порядок фаз фиксирован и не меняется:

```text
PLANNING -> RESOLUTION -> UPDATE -> PLANNING
```

В PLANNING игроки формируют приказы. Сервер проверяет действия, выполняет
RESOLUTION, применяет UPDATE, создаёт снимки хода и запускает новый таймер.
Сохранённый deadline восстанавливается после перезапуска.

Клиент не является источником игровых правил. Он получает персонализированную
проекцию состояния, показывает доступные действия и отправляет команды серверу.

## Карта, навигация и видимость

- Стратегическая карта показывает доступную область, позволяет выбирать гекс и
  планировать маршрут выбранного Юнита.
- Тактическая карта показывает один гекс крупным планом. Переходы и прокладка
  маршрутов за пределы этого гекса заблокированы. Объекты распределяются по
  отдельным орбитам: Планеты, Армии, Станции, Кораблекрушения, Аномалии, Флоты.
- Карта Навигатора является отдельным слоем. Она доступна администратору и
  игроку с эффективным Навигатором и показывает только цвет варп-области и
  значение ДВВ.
- Варп-видимость вычисляется сервером из собственных источников игрока. Союз не
  предоставляет глобальную варп-видимость.
- Собственные Юниты видны всегда. Чужие и нейтральные объекты раскрываются через
  Detection. Планеты и союзники не дают глобального обзора чужих Юнитов.
- Администратор получает полную проекцию карты.

Один гекс может одновременно содержать несколько Планет, Станций,
Кораблекрушений, Аномалий, Флотов и Армий. `Tile.planetId` оставлен только для
совместимости старых snapshot; актуальные системы используют координаты
коллекций объектов и `getObjectsAtHex(state, coord)`.

## Основные игровые механики

- SPACE-Юниты расходуют movement points с учётом стоимости входа в варп-гекс.
  Топливо можно конвертировать в очки движения в пределах максимума Юнита.
- GROUND-Юниты могут находиться на Планете или транспортироваться SPACE-Флотом
  после подтверждения запроса и проверки вместимости.
- До выплаты десятины Планета производит ресурсы в `rawStock`. После выплаты
  новая генерация поступает в `shop.resources`.
- `RAID_STOCK` забирает ресурсы из Магазина и не засчитывается в имперскую
  десятину.
- Магазин принимает выбранный состав оплаты из инвентаря Флота. Поддерживаются
  утверждённые направления обмена; `PRODUCT -> RAW` остаётся запрещённым.
- Artifact является уникальным экземпляром и переносится атомарно. Knowledge
  копируется без дублей. Одноразовые Artifact actions защищены `commandId`.
- При уничтожении Юнита Artifact и Knowledge переходят в Shipwreck; обычные
  RAW/PRODUCT-ресурсы уничтожаются.
- Secret Storage может быть настроен у Планеты или Станции. Пароль и содержимое
  остаются на сервере и не попадают в обычную клиентскую проекцию.
- Administratum ведёт реестр миров и обрабатывает предложения по изменению
  десятины во время разрешения хода.

## Авторизация и сессии

Пароли не хранятся в открытом виде. Для них используется `scrypt` со случайной
солью. Историческая пара `admin/admin123` при миграции удаляется и требует
повторного bootstrap администратора.

После входа сервер выдаёт cookie `hq_session` с атрибутами `HttpOnly`,
`SameSite=Lax` и `Path=/`. Для API также принимается `Authorization: Bearer`.
Сессии хранятся в snapshot и имеют срок жизни 24 часа.

Смена собственного пароля:

```http
POST /api/account/password
Content-Type: application/json

{
  "currentPassword": "current-password",
  "newPassword": "new-long-password"
}
```

Успешная смена пароля отзывает все сессии аккаунта. Смена логина или пароля
игрока администратором также отзывает его сессии.

## Хранение и надёжность

Snapshot имеет текущую `schemaVersion: 3` и содержит:

- `gameState` — карту, игровые сущности, события, Detection, Audit и историю
  обработанных команд;
- `accounts` — логины, роли и scrypt-хеши;
- `sessions` — серверные сессии;
- `turnSnapshots` — START/END-снимки ходов для административного rollback.

### Атомарная запись

`DocumentDb` сохраняет snapshot в той же директории по схеме:

```text
temporary file -> write -> fsync -> close -> atomic rename
```

Внутренний committed snapshot меняется только после успешной записи. Если файл
существует, но содержит повреждённый JSON или неверную структуру, сервер
завершает запуск с ошибкой и не заменяет его seed-данными.

Перед ручным восстановлением сохраните копию повреждённого `data/db.json`.

### Транзакции состояния

Операции изменения состояния проходят единый серверный pipeline:

```text
working candidate -> command -> validation -> persist -> commit -> broadcast
```

Транзакция охватывает `GameState`, аккаунты, сессии, turn snapshots, pending
actions, предложения союзов и ready-state игроков. Ошибка валидации или записи
восстанавливает последний committed runtime; broadcast не выполняется.

Игровое ядро зависит от интерфейса `GameRepository`. JSON-реализация находится
в `src/storage/documentDb.ts`, поэтому формат хранения изолирован от use cases.

### Версирование и миграции

Snapshot без `schemaVersion` считается v1. Миграции выполняются последовательно:

```text
v1 -> v2 -> v3
```

v1 → v2 переносит legacy plaintext-пароли в scrypt-хеши и отзывает публичный
`admin/admin123`. v2 → v3 добавляет актуальные коллекции sessions и turn
snapshots. Snapshot из более новой, неизвестной серверу версии не загружается.

`normalization.ts` остаётся compatibility-слоем для старых полей игрового
состояния; нормализация инвентарей и магазинов вынесена в отдельный модуль.

### Снимки и rollback

Сервер хранит до 100 START/END-снимков. Rollback доступен только администратору,
в текущей фазе PLANNING и только к снимку PLANNING. После восстановления:

- pending actions, предложения союзов и ready-state очищаются;
- создаётся новый START snapshot и deadline;
- состояние сохраняется до рассылки клиентам;
- Audit и `processedCommands` сохраняются из текущей ветки и не откатываются,
  чтобы не стирать журнал и не допускать повтор старой команды.

### Graceful shutdown

На `SIGINT` и `SIGTERM` сервер:

1. перестаёт принимать новые команды;
2. останавливает таймер хода;
3. сохраняет последнее состояние;
4. закрывает WebSocket и HTTP server;
5. пишет результат в structured log.

## Идемпотентность команд

Немедленные изменяющие состояние WebSocket-команды используют `commandId`.
Сервер сохраняет до 1000 обработанных результатов и при повторе возвращает тот
же результат с `duplicate: true`, не применяя операцию повторно.

`commandId` обязателен для resource transfer, Shop trade, Army transport,
управления ally vision, Secret Storage, Administratum actions, Artifact/Item
actions, конвертации топлива и принудительного завершения хода.

Обычные планируемые приказы `submitAction` и `removeAction` используют ID самого
приказа и разрешаются в фазовом цикле.

## Наблюдаемость

Сервер пишет однострочные JSON-логи с `timestamp`, `level`, `event` и контекстом.
Для ошибок команд по возможности добавляются `commandId`, `playerId` и username.

- `GET /health` — liveness; возвращает `200`, пока процесс обслуживает HTTP.
- `GET /ready` — readiness; возвращает `503` во время shutdown или после ошибки
  persistence и `200` после успешного сохранения.

Оба ответа включают:

- текущее число WebSocket-соединений;
- суммарное число ошибок команд;
- суммарное число ошибок persistence;
- длительность и время последнего RESOLUTION.

Audit ограничен 5000 записями, игровой event log — 1000 событиями.

## HTTP API

### Public и auth

- `GET /health`
- `GET /ready`
- `POST /api/login`
- `GET /api/me`
- `GET /api/state`
- `POST /api/logout`
- `POST /api/account/password`

Все остальные HTTP-маршруты требуют роль администратора.

### Игроки, фракции и отношения

- `GET|POST /api/admin/players`
- `PUT|DELETE /api/admin/players/:id`
- `GET|POST /api/admin/factions`
- `PUT|DELETE /api/admin/factions/:id`
- `GET|POST|DELETE /api/admin/relations`

Для relation payload используется `type: "WAR" | "ALLIANCE"` и пара player ID.

### Планеты и Юниты

- `GET|POST /api/admin/planets`
- `PUT|DELETE /api/admin/planets/:id`
- `GET|POST /api/admin/fleets`
- `PUT|DELETE /api/admin/fleets/:id`
- `POST /api/admin/armies`
- `GET|POST /api/admin/unit-variants`
- `PUT|DELETE /api/admin/unit-variants/:id`

`Fleet` сохранён в DTO и snapshot как compatibility-имя. В доменной типизации
актуальная сущность называется `Unit`; Юнит различается по `domain: SPACE | GROUND`.

### Объекты мира, магазины и предметы

- `GET|POST /api/admin/stations`
- `PUT|DELETE /api/admin/stations/:id`
- `GET|POST /api/admin/shipwrecks`
- `GET|POST /api/admin/anomalies`
- `PUT /api/admin/shops/PLANET/:id`
- `PUT /api/admin/shops/STATION/:id`
- `POST /api/admin/items`
- `PUT|DELETE /api/admin/artifacts/:id`

### Настройки и экономика

- `GET|PUT /api/admin/product-conversion-rates`
- `PUT /api/admin/system-settings`
- `POST /api/admin/warp-disturbance/randomize`

### Надёжность и управление ходом

- `GET /api/admin/audit`
- `GET /api/admin/turn-snapshots`
- `POST /api/admin/turn-snapshots/:id/rollback`
- `POST /api/admin/end-turn`

Изменяющие игровой мир административные операции разрешены только в подходящей
фазе; сервер повторно проверяет payload и полномочия независимо от UI.

## WebSocket protocol

Основные входящие сообщения описаны в `src/api/ws.ts`:

- планирование: `submitAction`, `removeAction`, `playerReady`;
- завершение хода: `endTurn`;
- ресурсы и экономика: `resourceTransfer`, `shopTrade`,
  `convertFuelToMovement`;
- транспорт Армий: `requestArmyEmbark`, `respondArmyEmbark`,
  `disembarkArmy`;
- предметы: `itemTransfer`, `artifactUse`, `openSecretStorage`;
- Administratum: `reportWorld`, `proposeTithe`;
- видимость: `setFleetAllyVision`.

Сервер отправляет `stateUpdate`, `turnResolved`, `operationResult` и
`secretStorageResult`. `stateUpdate` всегда фильтруется по сессии на сервере.

## Структура проекта

```text
src/
  api/ws.ts                       WebSocket DTO
  server.ts                       composition root HTTP/WS
  server/admin/                   административные use cases
  server/realtime.ts              диспетчер WebSocket-команд
  server/realtime/                idempotency/result handling
  server/normalization.ts         compatibility-нормализация GameState
  server/normalization/           нормализаторы отдельных feature
  server/stateTransaction.ts      persist/commit/rollback boundary
  server/observability.ts         JSON logs, health/readiness, metrics
  storage/gameRepository.ts       абстракция persistence
  storage/documentDb.ts           атомарная JSON-реализация
  storage/snapshot.ts             schema v3
  storage/migrations/             последовательные миграции
  systems/                        чистые игровые системы
  turn/                           разрешение хода, таймер и snapshots
client/
  index.html                      игровой интерфейс
  admin.html                      панель администратора
  src/main.ts                     orchestration игрового клиента
  src/admin.ts                    orchestration админки
  src/mapScene.ts                 Pixi render/input presentation
  src/game/, src/map/, src/ui/    клиентские feature-модули
test/
  gameplay.test.ts                игровые правила
  persistence.test.ts             atomic write, corruption, migrations, rollback
```

## Скрипты

- `npm run dev` — консольный demo;
- `npm run dev:server` — HTTP API и WebSocket server;
- `npm run dev:client` — Vite client;
- `npm run dev:game` — server и client одновременно;
- `npm run check` — проверка TypeScript без emit;
- `npm test` — gameplay и persistence tests;
- `npm run build:core` — сборка server/core в `dist/`;
- `npm run build:client` — сборка клиента в `dist/client/`;
- `npm run build` — полная сборка;
- `npm run start:server` — запуск собранного `dist/server.js`;
- `npm run start` — запуск собранного console demo.

## Проверка перед изменениями

```bash
npm run check
npm test
npm run build
```

## Ограничения MVP

- `DocumentDb` использует синхронную файловую запись и рассчитан на один
  серверный процесс. Несколько процессов не должны одновременно писать один
  `data/db.json`.
- Snapshot может быть крупным: сохраняется полное состояние, а не журнал
  изменений.
- Cookie пока не получает атрибут `Secure`; production-развёртывание должно
  использовать TLS/reverse proxy и дополнительно проверить cookie/CORS policy.
- CORS отражает присланный `Origin` для credentialed requests и не заменяет
  сетевой allowlist reverse proxy.
- SQLite/PostgreSQL пока не реализованы; для них предусмотрен `GameRepository`.
