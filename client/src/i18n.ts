export type Locale = "en" | "ru";

const STORAGE_KEY = "40khq.locale";

const messages = [
  ["Authentication", "Авторизация"], ["Username", "Имя пользователя"], ["Password", "Пароль"],
  ["Login", "Войти"], ["Logout", "Выйти"], ["Not authenticated", "Не авторизован"],
  ["User", "Пользователь"], ["Turn", "Ход"], ["Map", "Карта"], ["Name", "Название"], ["No events", "Событий нет"], ["Phase", "Фаза"], ["Resources", "Ресурсы"],
  ["Not logged in", "Вход не выполнен"], ["Connection", "Соединение"],
  ["Unit Orders", "Приказы юнитам"], ["Clear Path", "Сбросить маршрут"],
  ["Set Attack", "Атакующая стойка"], ["Set Defense", "Защитная стойка"],
  ["Ally visibility", "Видимость для союзников"], ["Видимость для союзников", "Видимость для союзников"],
  ["Army Transport", "Транспортировка армии"], ["Fleet in the same hex", "Флот в том же гексе"],
  ["Request embark", "Запросить погрузку"], ["Disembark on planet", "Высадиться на планету"],
  ["Accept", "Принять"], ["Decline", "Отказать"], ["Resource Transfer", "Передача ресурсов"],
  ["Fleet inventory and planet product storage.", "Инвентарь флота и хранилище продукции планеты."],
  ["Fleet inventory and your personal planet product storage.", "Инвентарь флота и ваше личное хранилище продукции на планете."],
  ["Fleet -> Fleet", "Флот → Флот"], ["Fleet -> Personal Planet Storage", "Флот → Личный склад планеты"],
  ["Personal Planet Storage -> Fleet", "Личный склад планеты → Флот"],
  ["Your Product Storage", "Ваш склад продуктов"],
  ["Transfer mode", "Режим передачи"], ["Target fleet (same hex)", "Целевой флот (тот же гекс)"],
  ["Resource", "Ресурс"], ["Raw Resources", "Ресурсы"], ["Products", "Продукты"], ["Amount", "Количество"], ["Transfer", "Передать"],
  ["Planet Actions", "Действия планеты"], ["Raw stock", "Сырьевые запасы"],
  ["Take Stock", "Забрать запасы"], ["Raid Stock", "Разграбить запасы"],
  ["Product", "Продукт"], ["Create Product", "Создать продукт"], ["Raise Morale", "Повысить мораль"],
  ["Deploy Informant", "Внедрить информатора"], ["Info category", "Категория информации"],
  ["Tithe level", "Уровень десятины"], ["Set Tithe", "Установить десятину"],
  ["Diplomacy", "Дипломатия"], ["Target player", "Целевой игрок"], ["Declare War", "Объявить войну"],
  ["Propose Alliance", "Предложить союз"], ["Turn Control", "Управление ходом"],
  ["Player Ready", "Игрок готов"], ["End Turn (Admin)", "Завершить ход (админ)"],
  ["Admin Panel", "Панель администратора"], ["Add Player", "Добавить игрока"],
  ["Add Planet", "Добавить планету"], ["Add Fleet", "Добавить флот"], ["Add Army", "Добавить армию"], ["Events", "События"],
  ["Relations", "Отношения"], ["Alliances", "Союзы"], ["Wars", "Войны"], ["Close", "Закрыть"],
  ["Reset", "Сбросить"], ["Plot route here", "Проложить сюда маршрут"], ["Players", "Игроки"], ["Factions", "Фракции"], ["Planets", "Планеты"],
  ["Fleets", "Флоты"], ["Armies", "Армии"], ["Player ID", "ID игрока"], ["Name", "Название"], ["Unit color", "Цвет юнитов"],
  ["Owner Player", "Игрок-владелец"], ["Placement", "Размещение"], ["Destination", "Место назначения"],
  ["Planet", "Планета"], ["Fleet", "Флот"],
  ["Alignment", "Сторона"], ["Faction", "Фракция"], ["Faction ID", "ID фракции"],
  ["Faction Name", "Название фракции"], ["Description", "Описание"], ["Add Faction", "Добавить фракцию"],
  ["Planet ID", "ID планеты"], ["Planet Name", "Название планеты"], ["World Type", "Тип мира"], ["World Tags (comma)", "Теги мира (через запятую)"],
  ["World Tags", "Теги мира"], ["Current Resources", "Текущие ресурсы"], ["Current Products", "Текущая продукция"],
  ["Population", "Население"], ["Morale", "Мораль"], ["Tithe Level", "Уровень десятины"],
  ["Maximum Tithe Level", "Максимальный уровень десятины"], ["Tithe Rules", "Правила десятины"],
  ["Required amount", "Требуемое количество"], ["Save Rule", "Сохранить правило"], ["Delete Rule", "Удалить правило"],
  ["Per-turn generation JSON", "Генерация за ход JSON"], ["Per-turn Generation JSON", "Генерация за ход JSON"],
  ["Generation coefficients JSON", "Коэффициенты генерации JSON"], ["Generation Coefficients JSON", "Коэффициенты генерации JSON"],
  ["Generated Resources", "Генерируемые ресурсы"],
  ["Tithe Contributions JSON", "Переданные в десятину ресурсы JSON"],
  ["May take planet resources", "Разрешено забирать ресурсы планет"],
  ["Tithe Paid", "Выплаченная десятина"], ["Influence Value", "Значение влияния"],
  ["Vision Range", "Дальность видимости"], ["Overview Range", "Дальность обзора"],
  ["Fleet ID", "ID флота"], ["Owner Player ID", "ID владельца"], ["Combat Power", "Боевая мощь"],
  ["Health", "Здоровье"], ["Influence", "Влияние"], ["Action Points", "Очки действий"],
  ["Capacity", "Вместимость"], ["Stance", "Стойка"], ["Domain", "Тип юнита"],
  ["Inventory JSON", "Инвентарь JSON"], ["Relation Type", "Тип отношений"],
  ["Player A ID", "ID игрока A"], ["Player B ID", "ID игрока B"],
  ["Add Relation", "Добавить отношение"], ["Remove Relation", "Удалить отношение"],
  ["Delete", "Удалить"], ["Select", "Выбрать"], ["Selected", "Выбрано"],
  ["No controllable fleets in this hex", "В этом гексе нет управляемых флотов"],
  ["none", "нет"], ["(no factions)", "(нет фракций)"], ["(no players)", "(нет игроков)"],
  ["Select a controllable fleet first", "Сначала выберите управляемый флот"],
  ["Transfer endpoints are not available in current context", "В текущей ситуации передача ресурсов недоступна"],
  ["No transferable resources available for current source/target", "Для выбранных источника и цели нет доступных ресурсов"],
  ["No raw stock available for selected fleet", "Для выбранного флота нет доступных сырьевых запасов"],
  ["No product recipe available for selected planet and inventories", "Для выбранной планеты и инвентарей нет доступного рецепта"],
  ["Route must be built one adjacent hex at a time", "Маршрут нужно прокладывать по одному соседнему гексу"],
  ["No action points remaining", "Очки действий закончились"],
  ["Ready flag sent", "Готовность игрока отправлена"], ["endTurn sent", "Команда завершения хода отправлена"],
  ["Received malformed message", "Получено некорректное сообщение сервера"],
  ["Disconnected. Reconnecting...", "Соединение потеряно. Переподключение..."],
  ["Socket error. Reconnecting...", "Ошибка соединения. Переподключение..."],
  ["Enter username and password", "Введите имя пользователя и пароль"],
  ["Socket is not connected", "Соединение с сервером не установлено"],
  ["Resource transfers are available only in PLANNING phase", "Передача ресурсов доступна только в фазе планирования"],
  ["Fleet vision can be changed only during PLANNING", "Настройки обзора флота можно менять только в фазе планирования"],
  ["Fleet does not belong to player", "Флот не принадлежит игроку"],
  ["enabled must be a boolean", "Поле enabled должно быть логическим значением"],
  ["Fleet vision shared with allies", "Область обзора флота передаётся союзникам"],
  ["Fleet vision sharing disabled", "Передача области обзора союзникам отключена"],
  ["Admin endTurn requires admin role and PLANNING", "Для завершения хода нужны права администратора и фаза планирования"],
  ["Turn resolved", "Ход обработан"],
  ["Turn resolution is already running", "Обработка хода уже выполняется"],
  ["Artifact access denied", "Нет доступа к артефакту"],
  ["Shop not found or disabled", "Магазин не найден или отключён"],
  ["Buyer must control a fleet in the Shop hex", "Покупатель должен управлять флотом в гексе магазина"],
  ["Invalid requested Shop resource or amount", "Некорректный ресурс или количество для покупки"],
  ["Shop does not have enough requested resource", "В магазине недостаточно выбранного ресурса"],
  ["Payment composition is required", "Необходимо указать состав оплаты"],
  ["Create Shipwreck", "Создать кораблекрушение"],
  ["Source Unit IDs (optional, comma-separated)", "ID исходных юнитов (необязательно, через запятую)"],
  ["Source unit IDs must be positive integers", "ID исходных юнитов должны быть положительными целыми числами"],
  ["Invalid shipwreck payload", "Некорректные данные кораблекрушения"],
  ["Cannot place shipwreck on obstacle tile", "Нельзя разместить кораблекрушение на гексе с препятствием"],
  ["Payment composition is empty", "Состав оплаты пуст"],
  ["Payment composition", "Состав оплаты"],
  ["Select resources from the selected fleet inventory.", "Выберите ресурсы из инвентаря выбранного флота."],
  ["No resources available for payment", "Нет ресурсов, доступных для оплаты"],
  ["Select at least one payment resource", "Выберите хотя бы один ресурс для оплаты"],
  ["Payment contains an invalid resource", "В оплате указан недопустимый ресурс"],
  ["Payment amounts must be positive integers", "Количество ресурсов в оплате должно быть положительным целым числом"],
  ["Unsupported exchange path (TODO DEC-016)", "Это направление обмена недоступно до решения DEC-016"],
  ["Source and target inventories must differ", "Исходный и целевой инвентари должны различаться"],
  ["Inventory access denied", "Нет доступа к инвентарю"],
  ["Artifact or inventory not found", "Артефакт или инвентарь не найден"],
  ["Artifact is not owned by source inventory", "Артефакт не принадлежит исходному инвентарю"],
  ["Target already contains artifact", "Целевой инвентарь уже содержит этот артефакт"],
  ["Inventory not found", "Инвентарь не найден"],
  ["Source does not contain knowledge", "В исходном инвентаре нет этого знания"],
  ["Artifact has no Use action", "У артефакта нет действия «Использовать»"],
  ["Artifact is on cooldown", "Артефакт восстанавливается"],
  ["Invalid resource transfer payload", "Некорректные данные передачи ресурсов"],
  ["Transfer amount must be a positive integer", "Количество для передачи должно быть положительным целым числом"],
  ["Invalid resource key", "Некорректный код ресурса"],
  ["Invalid resource endpoint kind", "Некорректный тип точки передачи"],
  ["Source and destination must be different", "Источник и получатель должны различаться"],
  ["Source endpoint not found", "Источник передачи не найден"],
  ["Destination endpoint not found", "Получатель передачи не найден"],
  ["Source and destination must be in the same hex", "Источник и получатель должны находиться в одном гексе"],
  ["Army does not belong to player", "Армия не принадлежит игроку"],
  ["Carrier fleet does not exist", "Флот-перевозчик не существует"],
  ["Army is already embarked on this fleet", "Армия уже погружена на этот флот"],
  ["Army and fleet must be in the same hex", "Армия и флот должны находиться в одном гексе"],
  ["Carrier fleet must be owned by player or a mutual ally", "Флот-перевозчик должен принадлежать игроку или взаимному союзнику"],
  ["Embarkation is available only before movement is planned", "Погрузка доступна только до планирования движения"],
  ["Embarkation request sent", "Запрос на погрузку отправлен"],
  ["Embarkation request not found", "Запрос на погрузку не найден"],
  ["Only carrier owner can respond", "Ответить может только владелец перевозчика"],
  ["Embarkation request declined", "Запрос на погрузку отклонён"],
  ["Embarkation request expired: army and fleet are no longer eligible", "Запрос на погрузку устарел: армия и флот больше не соответствуют условиям"],
  ["Embarkation request expired: operation is available only at the start of the turn", "Запрос на погрузку устарел: операция доступна только в начале хода"],
  ["Army embarked", "Армия погружена"], ["Army is not embarked", "Армия не погружена"],
  ["Only army or carrier owner can disembark", "Высадить армию может только владелец армии или перевозчика"],
  ["Disembarkation is available only before movement is planned", "Высадка доступна только до планирования движения"],
  ["Army can disembark only onto a planet", "Армия может высадиться только на планету"],
  ["Economy action had no effect", "Экономическое действие не дало результата"],
  ["Payment contains an invalid resource or amount", "В оплате указан некорректный ресурс или количество"],
  ["Payment is empty", "Оплата не указана"],
  ["Valid commandId is required", "Требуется корректный commandId"],
  ["Immediate action requires a valid action.id", "Для немедленного действия требуется корректный action.id"],
  ["Shop trade requires PLANNING and a valid commandId", "Торговля доступна в фазе планирования и требует корректный commandId"],
  ["Item transfer requires PLANNING and a valid commandId", "Передача предмета доступна в фазе планирования и требует корректный commandId"],
  ["Artifact use requires PLANNING and a valid commandId", "Использование артефакта доступно в фазе планирования и требует корректный commandId"],
  ["Admin endTurn requires a valid commandId", "Для завершения хода требуется корректный commandId"],
  ["Fleet does not exist", "Флот не существует"],
  ["Armies cannot move independently", "Армии не могут перемещаться самостоятельно"],
  ["Total path length for fleet exceeds action points", "Длина маршрута флота превышает доступные очки действий"],
  ["Step is outside map bounds", "Шаг находится за пределами карты"],
  ["Tile does not exist", "Гекс не существует"],
  ["Path crosses an obstacle tile", "Маршрут проходит через препятствие"],
  ["Each path step must be adjacent", "Каждый шаг маршрута должен вести в соседний гекс"],
  ["Player does not exist", "Игрок не существует"],
  ["Target player does not exist", "Целевой игрок не существует"],
  ["Cannot target self in diplomacy", "Нельзя выбрать себя целью дипломатии"],
  ["Only one diplomacy action per (player,target) pair per turn", "За ход допускается одно дипломатическое действие для пары игроков"],
  ["Fleet stance must be ATTACK or DEFENSE", "Стойка флота должна быть ATTACK или DEFENSE"],
  ["Planet does not exist", "Планета не существует"],
  ["Player must have at least one fleet in planet hex", "В гексе планеты должен находиться хотя бы один флот игрока"],
  ["fleetId is required", "Необходимо указать fleetId"],
  ["fleetId not found or fleet does not belong to player", "Флот не найден или не принадлежит игроку"],
  ["fleet must be in the same hex as target planet", "Флот должен находиться в гексе целевой планеты"],
  ["amount must be a number", "Количество должно быть числом"],
  ["amount must be positive", "Количество должно быть положительным"],
  ["resourceKey is invalid", "Некорректный код ресурса"],
  ["TAKE_STOCK/RAID_STOCK requires a raw resource key", "Изъятие и грабёж требуют сырьевой ресурс"],
  ["TAKE_STOCK requires an imperial player", "Изъятие запасов доступно только имперскому игроку"],
  ["RAID_STOCK requires a non-imperial player", "Грабёж доступен только неимперскому игроку"],
  ["productKey is invalid", "Некорректный код продукта"],
  ["infoCategory is invalid", "Некорректная категория информации"],
  ["titheLevel is invalid", "Некорректный уровень десятины"],
  ["Player can raise morale only once per turn", "Игрок может повысить мораль только один раз за ход"],
  ["fleet not found or does not belong to player", "Флот не найден или не принадлежит игроку"],
  ["fleet is not in planet hex", "Флот не находится в гексе планеты"],
  ["player is not allowed to take planet resources", "Игроку запрещено забирать ресурсы планеты"],
  ["resourceKey must be a raw resource", "Выбранный ресурс должен относиться к сырью"],
  ["planet tithe cap has been reached", "Лимит текущей десятины планеты достигнут"],
  ["cannot raid while ground units are present", "Грабёж невозможен, пока в гексе присутствуют наземные юниты"],
  ["resourceKey is required", "Необходимо указать ресурс"],
  ["fleet does not have this resource in inventory", "В инвентаре флота нет выбранного ресурса"],
  ["player must have a fleet in planet hex", "В гексе планеты должен находиться флот игрока"],
  ["tithe levels are configured by the administrator", "Уровни десятины настраиваются администратором"],
  ["Resource conversion rates updated", "Коэффициенты преобразования ресурсов обновлены"],
  ["Fleet created", "Флот создан"], ["Army created", "Армия создана"],
  ["Relation mutation failed: player ids are required", "Не удалось изменить отношения: укажите ID игроков"],
  ["Owner player is required", "Необходимо указать владельца"],
  ["Army owner and destination are required", "Необходимо указать владельца и место назначения армии"],
  ["Enter username/password", "Введите имя пользователя и пароль"],
  ["take stock is only for imperial players", "Изъятие запасов доступно только имперским игрокам"],
  ["raid stock is only for non-imperial players", "Грабёж доступен только неимперским игрокам"],
  ["planet raw stock is empty for this resource", "В сырьевом складе планеты нет выбранного ресурса"],
  ["planet Shop is empty for this resource", "В магазине планеты нет выбранного ресурса"],
  ["planet product storage is empty for this resource", "На складе продукции планеты нет выбранного ресурса"],
] as const;

// Text displayed to users; protocol identifiers remain unchanged in values and snapshots.
const extraMessages: readonly (readonly [string, string])[] = [
  ["40k Headquarters - Tactical View", "40k Штаб — тактическая карта"],
  ["40k Headquarters - Admin", "40k Штаб — администрирование"],
  ["40k Headquarters", "40k Штаб"], ["40k HQ Admin", "Администрирование 40k Штаба"],
  ["Back To Game", "Вернуться в игру"], ["Ends", "Окончание"],
  ["Use credentials configured on the server.", "Используйте учётные данные, настроенные на сервере."],
  ["Use an admin account configured on the server.", "Используйте учётную запись администратора, настроенную на сервере."],
  ["Query params:", "Параметры запроса:"], ["Admin page:", "Страница администратора:"],
  ["Selected fleet: none", "Флот не выбран"], ["Planned path: 0 steps", "Маршрут не задан"],
  ["Shop & Items", "Магазин и предметы"], ["Shop", "Магазин"],
  ["A selected fleet can trade with a detected Shop in its hex.", "Выбранный флот может торговать с обнаруженным магазином в своём гексе."],
  ["Receive", "Получить"], ["Trade", "Торговать"], ["Fleet Artifact", "Артефакт флота"],
  ["Use Artifact", "Использовать артефакт"],
  ["Artifact and Knowledge inventories are also shown in Unit Orders.", "Артефакты и знания также показаны в приказах юнитам."],
  ["Detected Objects", "Обнаруженные объекты"], ["Planet: none", "Планета не выбрана"],
  ["Report world", "Сообщить о мире"], ["Propose tithe", "Предложить десятину"],
  ["Secret storage", "Секретное хранилище"], ["Object", "Объект"], ["Open", "Открыть"],
  ["Administratum registry", "Реестр Администратума"],
  ["Tactical map", "Тактическая карта"], ["Strategic map", "Стратегическая карта"],
  ["Navigator map", "Карта Навигатора"], ["Reset focus", "Сбросить фокус"],
  ["Clear route", "Сбросить маршрут"], ["Fuel to movement points", "Топливо в Очки движения"],
  ["Use fuel", "Использовать топливо"], ["Main view", "Основной вид"],
  ["Zoom out", "Уменьшить масштаб"], ["Zoom in", "Увеличить масштаб"],
  ["Product Conversion", "Преобразование продуктов"],
  ["Product output from one unit of its recipe resource.", "Выход продукта из одной единицы исходного ресурса."],
  ["Save Conversion Rates", "Сохранить коэффициенты преобразования"],
  ["Player ID (automatic)", "ID игрока (автоматически)"], ["Planet ID (automatic)", "ID планеты (автоматически)"],
  ["Fleet ID (automatic)", "ID флота (автоматически)"], ["Faction Code", "Код фракции"],
  ["Navigator (manual)", "Навигатор (вручную)"], ["Navigator", "Навигатор"],
  ["Chaos", "Хаос"], ["Administratum", "Администратум"],
  ["Movement points", "Очки движения"], ["Maximum movement points", "Максимальные ОД"],
  ["Navigator trait", "Признак «Навигатор»"], ["Trait Навигатор", "Признак «Навигатор»"],
  ["Warp Visibility", "Варп-видимость"],
  ["Unit variant", "Вид юнита"], ["Stations", "Станции"],
  ["Capabilities define which Station systems are active.", "Возможности определяют активные системы станции."],
  ["Owner faction", "Фракция-владелец"], ["Secret Storage", "Секретное хранилище"],
  ["Fleet combat power (stored only)", "Боевая мощь флота (только хранение)"],
  ["Army combat power (stored only)", "Боевая мощь армии (только хранение)"],
  ["Generation JSON", "Генерация JSON"], ["Raw stock JSON", "Сырьевые запасы JSON"],
  ["Info fragments JSON", "Фрагменты информации JSON"], ["Capabilities", "Возможности"],
  ["Create Station", "Создать станцию"], ["Cancel Edit", "Отменить редактирование"],
  ["Planet / Station", "Планета / станция"], ["Resources JSON", "Ресурсы JSON"],
  ["Disappearing items JSON", "Исчезающие предметы JSON"],
  ["Knowledge codes JSON", "Коды знаний JSON"], ["Save Shop", "Сохранить магазин"],
  ["System settings", "Системные параметры"],
  ["Base fleet movement points", "Базовые Очки движения Флота"], ["Save", "Сохранить"],
  ["Generate warp disturbance", "Сгенерировать ШВВ"],
  ["Artifact & Knowledge Placement", "Размещение артефактов и знаний"],
  ["Target inventory JSON", "Целевой инвентарь JSON"], ["Kind", "Вид"],
  ["Knowledge / definition code", "Код знания / определения"],
  ["Artifact name", "Название артефакта"],
  ["Artifact useEffect JSON (optional)", "Эффект использования артефакта JSON (необязательно)"],
  ["Consumable Artifact", "Расходуемый артефакт"],
  ["Origin player for warp visibility", "Исходный игрок для варп-видимости"],
  ["Origin Player для Warp Visibility", "Исходный игрок для варп-видимости"],
  ["Place Item", "Разместить предмет"],
  ["Anomalies & Shipwrecks", "Аномалии и кораблекрушения"],
  ["Add Anomaly", "Добавить аномалию"], ["Anomalies", "Аномалии"],
  ["Shipwrecks", "Кораблекрушения"], ["Turn Reliability", "Надёжность ходов"],
  ["Timer: -", "Таймер: —"], ["Unit variants", "Виды юнитов"],
  ["Name", "Название"], ["Domain", "Домен"], ["Description", "Описание"],
  ["Add variant", "Добавить вид"], ["Force End Turn", "Принудительно завершить ход"],
  ["Reload", "Обновить"], ["Safe Rollback Snapshots", "Снимки для безопасного отката"],
  ["Persisted Audit", "Сохранённый журнал аудита"],
  ["Edit", "Изменить"], ["Save", "Сохранить"], ["Rollback", "Откатить"], ["Saved", "Сохранено"],
  ["Extension data loaded", "Дополнительные данные загружены"],
  ["Enter a variant name", "Введите название вида"],
  ["Domain must be SPACE or GROUND", "Среда должна быть SPACE или GROUND"],
  ["Force end the turn?", "Завершить ход принудительно?"],
  ["Generate new warp disturbance values for all hexes?", "Сгенерировать новые значения ШВВ для всех гексов?"],
  ["Variant name", "Название вида"], ["Domain: SPACE or GROUND", "Среда: SPACE или GROUND"],
  ["New password", "Новый пароль"], ["Allowed types JSON", "Разрешённые типы JSON"],
  ["Secret storage resources JSON", "Ресурсы секретного хранилища JSON"],
  ["Ресурсы Secret Storage JSON", "Ресурсы секретного хранилища JSON"],
  ["Secret storage knowledge JSON", "Знания секретного хранилища JSON"],
  ["Knowledge Secret Storage JSON", "Знания секретного хранилища JSON"],
  ["assigned automatically", "назначается автоматически"],
  ["login username (optional)", "имя пользователя (необязательно)"],
  ["login password (optional)", "пароль (необязательно)"],
  ["password (required, 12+ characters)", "пароль (обязательно, не менее 12 символов)"],
  ["New password (leave blank to keep current)", "Новый пароль (пусто = не менять)"],
  ["information/content reference", "ссылка на сведения/содержимое"],
  ["population", "население"], ["morale", "мораль"], ["tithePaid", "выплаченная десятина"],
  ["influenceValue", "значение влияния"], ["visionRange", "дальность видимости"],
  ["combatPower", "боевая мощь"], ["health", "здоровье"], ["influence", "влияние"],
  ["movementPoints", "очки движения"], ["capacity", "вместимость"],
  ["resourceProduction", "производство ресурсов"],
  ["ATTACK", "АТАКА"], ["DEFENSE", "ЗАЩИТА"], ["ALLIANCE", "СОЮЗ"], ["WAR", "ВОЙНА"],
  ["NON_IMPERIAL", "НЕИМПЕРСКАЯ"], ["IMPERIAL", "ИМПЕРСКАЯ"],
  ["SPACE", "КОСМОС"], ["GROUND", "ПОВЕРХНОСТЬ"],
  ["STEALTH", "СКРЫТНОСТЬ"], ["KNOWLEDGE", "ЗНАНИЕ"], ["ARTIFACT", "АРТЕФАКТ"],
  ["EXACT", "ТОЧНО"], ["ESTIMATED", "ПРИБЛИЗИТЕЛЬНО"],
  ["PLANNING", "ПЛАНИРОВАНИЕ"], ["RESOLUTION", "РАЗРЕШЕНИЕ"], ["UPDATE", "ОБНОВЛЕНИЕ"],
  ["shared", "общий"], ["private", "личный"], ["yes", "да"], ["no", "нет"],
  ["PLANET", "ПЛАНЕТА"], ["STATION", "СТАНЦИЯ"], ["FLEET", "ФЛОТ"],
  ["ARMY", "АРМИЯ"], ["SHIPWRECK", "КОРАБЛЕКРУШЕНИЕ"], ["ANOMALY", "АНОМАЛИЯ"],
  ["MOVEMENT", "ПЕРЕМЕЩЕНИЕ"], ["COMBAT", "БОЙ"], ["DIPLOMACY", "ДИПЛОМАТИЯ"],
  ["SYSTEM", "СИСТЕМА"], ["DETECTION", "ОБНАРУЖЕНИЕ"],
  ["ADMINISTRATUM", "АДМИНИСТРАТУМ"],
  ["FOOD_RAW", "ПИЩЕВОЕ СЫРЬЁ"], ["ORE", "РУДА"], ["PROMETHIUM", "ПРОМЕТИЙ"],
  ["PEOPLE", "ЛЮДИ"], ["BLACK_STONE", "ЧЁРНЫЙ КАМЕНЬ"],
  ["PROVISIONS", "ПРОВИЗИЯ"], ["PARTS", "ДЕТАЛИ"], ["FUEL", "ТОПЛИВО"],
  ["SHIPS", "КОРАБЛИ"], ["WORKERS", "РАБОЧИЕ"], ["REGIMENTS", "ПОЛКИ"],
  ["FOOD_PRODUCTION", "ПРОИЗВОДСТВО ПИЩИ"],
  ["RESOURCE_GENERATION", "ГЕНЕРАЦИЯ РЕСУРСОВ"], ["RAW_STOCK", "СЫРЬЕВОЙ СКЛАД"],
  ["INFO_FRAGMENTS", "ФРАГМЕНТЫ ИНФОРМАЦИИ"], ["TAGS", "ТЕГИ"],
  ["MILITARY", "ВОЕННАЯ"], ["NAVAL", "ФЛОТСКАЯ"], ["ARISTOCRACY", "АРИСТОКРАТИЯ"],
  ["PSYKANA", "ПСАЙКАНА"], ["FORBIDDEN", "ЗАПРЕТНОЕ"], ["TECH_SECRETS", "ТЕХНОЛОГИЧЕСКИЕ ТАЙНЫ"],
  ["AGRI_WORLD", "АГРАРНЫЙ МИР"], ["MINING_WORLD", "ШАХТЁРСКИЙ МИР"],
  ["FORGE_WORLD", "МИР-КУЗНЯ"], ["HIVE_WORLD", "МИР-УЛЕЙ"],
  ["DEATH_WORLD", "МИР СМЕРТИ"], ["FEUDAL_WORLD", "ФЕОДАЛЬНЫЙ МИР"],
  ["FERAL_WORLD", "ДИКИЙ МИР"], ["QUARRY_WORLD", "КАРЬЕРНЫЙ МИР"],
  ["SHRINE_WORLD", "МИР-СВЯТЫНЯ"], ["INDUSTRIAL_WORLD", "ПРОМЫШЛЕННЫЙ МИР"],
  ["CEMETERY_WORLD", "МИР-КЛАДБИЩЕ"], ["FORTRESS_WORLD", "МИР-КРЕПОСТЬ"],
  ["GARDEN_WORLD", "МИР-САД"], ["PENAL_COLONY", "ШТРАФНАЯ КОЛОНИЯ"],
  ["INDUSTRIAL_PRODUCTION", "ПРОМЫШЛЕННОЕ ПРОИЗВОДСТВО"],
  ["REFINERY", "ПЕРЕРАБОТКА"], ["ASSEMBLY_SHIPYARDS", "СБОРОЧНЫЕ ВЕРФИ"],
  ["LABOR_CAMP", "ТРУДОВОЙ ЛАГЕРЬ"], ["RECRUITMENT_CENTER", "ЦЕНТР ВЕРБОВКИ"],
  ["PLAYER_STORAGE", "ХРАНИЛИЩЕ ИГРОКА"],
  ["FLEET_COMBAT_POWER", "БОЕВАЯ МОЩЬ ФЛОТА"],
  ["ARMY_COMBAT_POWER", "БОЕВАЯ МОЩЬ АРМИИ"],
  ["Army", "Армия"], ["Station", "Станция"],
  ["Warp", "Варп"], ["Origin Player", "Исходный игрок"],
  ["Shipwreck", "Кораблекрушение"], ["Anomaly", "Аномалия"],
  ["Hex", "Гекс"], ["Hex: -", "Гекс: —"],
  ["Confidence", "Достоверность"], ["Tags", "Теги"], ["Owner", "Владелец"],
  ["Allied Vision", "Обзор союзников"], ["Stance Pending", "Смена стойки ожидается"],
  ["Artifacts", "Артефакты"], ["Knowledge", "Знания"],
  ["Tithe", "Десятина"], ["Generated resources", "Генерируемые ресурсы"],
  ["Actual production per turn", "Фактическое производство за ход"],
  ["Raw Stock", "Сырьевой склад"], ["Info", "Информация"],
  ["Vision", "Обзор"], ["Info Fragments JSON", "Фрагменты информации JSON"],
  ["Planet", "Планета"], ["Fleet", "Флот"],
  ["Player not found", "Игрок не найден"], ["Planet not found", "Планета не найдена"],
  ["World already registered with the Administratum", "Мир уже зарегистрирован в Администратуме"],
  ["World registered with the Administratum", "Мир зарегистрирован в Администратуме"],
  ["Only the Administratum can propose a tithe", "Предлагать десятину может только Администратум"],
  ["World is not yet registered with the Administratum", "Мир ещё не зарегистрирован в Администратуме"],
  ["Invalid tithe level", "Недопустимый уровень десятины"],
  ["Tithe proposal saved", "Предложение по десятине сохранено"],
  ["Secret storage is disabled", "Секретное хранилище отключено"],
  ["Incorrect secret storage password", "Неверный пароль секретного хранилища"],
  ["Secret storage opened", "Секретное хранилище открыто"],
  ["Fuel conversion is available only during planning", "Конвертация топлива доступна только в фазе планирования"],
  ["Fuel amount must be a positive integer", "Количество топлива должно быть положительным целым числом"],
  ["Fleet does not belong to player", "Флот не принадлежит игроку"],
  ["Fleet lacks FUEL", "Во флоте недостаточно FUEL"],
  ["Conversion would exceed the maximum movement points", "Конвертация превысит максимальное количество ОД"],
  ["Fuel conversion requires a fleet owned by the player", "Для конвертации топлива требуется принадлежащий игроку флот"],
  ["Carrier fleet has insufficient capacity", "У флота-перевозчика недостаточно вместимости"],
  ["Embarkation request expired: carrier capacity is insufficient", "Запрос на погрузку устарел: у перевозчика недостаточно вместимости"],
  ["Artifact type is not allowed in Secret Storage", "Этот тип артефакта запрещён в секретном хранилище"],
  ["Knowledge type is not allowed in Secret Storage", "Этот тип знания запрещён в секретном хранилище"],
  ["Shipwreck already contains artifact", "Кораблекрушение уже содержит артефакт"],
  ["Artifact added to shipwreck", "Артефакт добавлен в кораблекрушение"],
  ["Knowledge added to shipwreck", "Знание добавлено в кораблекрушение"],
  ["Shipwrecks cannot contain RAW or PRODUCT resources", "Кораблекрушения не могут содержать сырьё или продукты"],
  ["Admin", "Администратор"], ["PLAYER", "ИГРОК"], ["ADMIN", "АДМИНИСТРАТОР"],
  ["RAW", "СЫРЬЁ"], ["PRODUCT", "ПРОДУКТ"],
  ["START", "НАЧАЛО"], ["END", "КОНЕЦ"],
  ["admin", "администратор"], ["player", "игрок"],
  ["Login failed", "Ошибка входа"], ["Session restore failed", "Ошибка восстановления сеанса"],
  ["Operation failed", "Ошибка операции"],
  ["Extension load failed", "Ошибка загрузки дополнительных данных"],
  ["Shop trade failed", "Ошибка торговли"],
];
const allMessages: readonly (readonly [string, string])[] = [...messages, ...extraMessages];

const eventKindsRu: Readonly<Record<string, string>> = {
  MOVEMENT: "Перемещение", COMBAT: "Бой", DIPLOMACY: "Дипломатия",
  SYSTEM: "Система", DETECTION: "Обнаружение", SHOP: "Магазин", SHIPWRECK: "Кораблекрушение",
  ADMINISTRATUM: "Администратум",
};

const objectKindsRu: Readonly<Record<string, string>> = {
  PLANET: "планета", FLEET: "флот", STATION: "станция",
  SHIPWRECK: "кораблекрушение", ANOMALY: "аномалия",
};

const endpointKindsRu: Readonly<Record<string, string>> = {
  FLEET: "флот", PLANET_STORAGE: "хранилище планеты",
};

const unitKindsRu: Readonly<Record<string, string>> = {
  Fleet: "Флот", Army: "Армия", Unit: "Юнит",
};

const actionKindsRu: Readonly<Record<string, string>> = {
  TAKE_STOCK: "Изъятие сырьевых запасов", RAID_STOCK: "Грабёж магазина",
  TAKE_FROM_STORAGE: "Получение со склада", DEPOSIT_TO_STORAGE: "Передача на склад",
  CREATE_PRODUCT: "Производство", ECCLESIARCHY_RAISE_MORALE: "Повышение морали",
  INQUISITION_DEPLOY_INFORMANT: "Внедрение информатора", ADMINISTRATUM_SET_TITHE: "Изменение десятины",
};

const placeholders = new Map<string, readonly [string, string]>([
  ["player id", ["player id", "ID игрока"]], ["player name", ["player name", "имя игрока"]],
  ["name", ["name", "название"]], ["username (optional)", ["username (optional)", "имя пользователя (необязательно)"]],
  ["password (optional)", ["password (optional)", "пароль (необязательно)"]],
  ["faction id", ["faction id", "ID фракции"]], ["faction name", ["faction name", "название фракции"]],
  ["description (optional)", ["description (optional)", "описание (необязательно)"]],
  ["planet id", ["planet id", "ID планеты"]], ["fleet id", ["fleet id", "ID флота"]],
  ["planet name", ["planet name", "название планеты"]],
  ["Quick search players...", ["Quick search players...", "Быстрый поиск игроков..."]],
  ["Quick search factions...", ["Quick search factions...", "Быстрый поиск фракций..."]],
  ["Quick search planets...", ["Quick search planets...", "Быстрый поиск планет..."]],
  ["Quick search fleets...", ["Quick search fleets...", "Быстрый поиск флотов..."]],
  ["Quick search armies...", ["Quick search armies...", "Быстрый поиск армий..."]],
  ["Quick search relations...", ["Quick search relations...", "Быстрый поиск отношений..."]],
]);

let locale: Locale = "en";
let applying = false;
const sourceByTextNode = new WeakMap<Text, string>();
const sourcePlaceholder = new WeakMap<HTMLInputElement, string>();
const sourceOptgroupLabel = new WeakMap<HTMLOptGroupElement, string>();
const sourceAttributes = new WeakMap<Element, Map<string, string>>();
const internalTextUpdates = new WeakSet<Text>();

function exact(text: string, language: Locale): string {
  for (const [en, ru] of allMessages) {
    if (text === en || text === ru) return language === "ru" ? ru : en;
  }
  return text;
}

function localizeCodes(text: string, language: Locale): string {
  return text.replace(/\b[A-Z][A-Z0-9_]{2,}\b/g, (code) => exact(code, language));
}

function englishFromRussian(text: string): string | null {
  const patterns: Array<[RegExp, (...parts: string[]) => string]> = [
    [/^#(\d+) · Ход (\d+) · (.+)$/, (id, turn, kind) =>
      `#${id} · Turn ${turn} · ${Object.entries(eventKindsRu).find(([, value]) => value === kind)?.[0] ?? kind}`],
    [/^Выбран (отряд|флот): (\d+) \(ОД (\d+)\/(\d+), (ATTACK|DEFENSE)(, pending)?\)$/, (kind, id, current, max, stance, pending) =>
      `Selected ${kind === "отряд" ? "army" : "fleet"}: ${id} (MP ${current}/${max}, ${stance}${pending ? ", pending" : ""})`],
    [/^Маршрут сокращён до (.+) \((\d+) шагов\)$/, (hex, steps) => `Route shortened to ${hex} (${steps} steps)`],
    [/^Добавлена точка маршрута (.+) \((\d+) шагов\)$/, (hex, steps) => `Added waypoint ${hex} (${steps} steps)`],
    [/^(\d+)\. (.+) · ход (\d+)(?: · предложения: (.+))?$/, (sequence, name, turn, proposals) =>
      `${sequence}. ${name.replace(/^Мир #/, "World #")} · turn ${turn}${proposals ? ` · proposals: ${proposals}` : ""}`],
    [/^(Флот|Армия|Юнит) (\d+) перемещён \[(.+)\] → \[(.+)\]$/, (kind, id, from, to) =>
      `${exact(kind, "en")} ${id} moved [${from}] → [${to}]`],
    [/^(Флот|Армия|Юнит) (\d+) получил ([\d.]+) урона и был уничтожен$/, (kind, id, damage) =>
      `${exact(kind, "en")} ${id} received ${damage} damage and was destroyed`],
    [/^(Флот|Армия|Юнит) (\d+) получил ([\d.]+) урона; ОЗ ([\d.-]+)$/, (kind, id, damage, hp) =>
      `${exact(kind, "en")} ${id} received ${damage} damage; HP ${hp}`],
    [/^Игроки (\d+) и (\d+) теперь находятся в состоянии войны$/, (a, b) => `Players ${a} and ${b} are now at war`],
    [/^Игроки (\d+) и (\d+) заключили союз$/, (a, b) => `Players ${a} and ${b} formed an alliance`],
    [/^Обнаружен объект: (планета|флот|станция|кораблекрушение|аномалия) (\d+) \((точно|оценочно)\)$/, (kind, id, confidence) =>
      `Detected ${({ планета: "PLANET", флот: "FLEET", станция: "STATION", кораблекрушение: "SHIPWRECK", аномалия: "ANOMALY" } as Record<string, string>)[kind]} ${id} (${confidence === "точно" ? "EXACT" : "ESTIMATED"})`],
    [/^Кораблекрушение (\d+) образовалось в \[(.+)\]$/, (id, position) => `Shipwreck ${id} formed at [${position}]`],
    [/^Администратум изменил десятину мира (\d+): (.+)$/, (id, level) =>
      `Administratum changed world ${id} tithe: ${level}`],
    [/^(\d+) FUEL преобразовано в Очки движения$/, (amount) => `${amount} FUEL converted to movement points`],
    [/^Обменено (\d+) ед\. ресурсов на (\d+) ([A-Z0-9_]+)$/, (paid, received, resource) =>
      `Traded ${paid} resources for ${received} ${resource}`],
    [/^Мир #(\d+) · ход (\d+)$/, (id, turn) => `World #${id} · turn ${turn}`],
    [/^(.+) · ход (\d+)$/, (name, turn) => `${name} · turn ${turn}`],
    [/^Крушение #(\d+)$/, (id) => `Shipwreck #${id}`],
    [/^Аномалия #(\d+)$/, (id) => `Anomaly #${id}`],
    [/^Армия #(\d+)$/, (id) => `Army #${id}`],
    [/^Флот #(\d+)$/, (id) => `Fleet #${id}`],
    [/^≈ Флот #(\d+)$/, (id) => `≈ Fleet #${id}`],
    [/^Флот не выбран$/, () => "Selected fleet: none"],
    [/^Маршрут не задан$/, () => "Planned path: 0 steps"],
    [/^Выбран флот: (.+)$/, (value) => `Selected fleet: ${value}`],
    [/^Выбрана армия: (.+)$/, (value) => `Selected army: ${value}`],
    [/^Гекс: (.+)$/, (value) => `Hex: ${value}`],
    [/^Игрок: (.+)$/, (value) => `Player: ${value}`],
    [/^Планета: (.+)$/, (value) => `Planet: ${value}`],
    [/^Маршрут: (\d+) шагов$/, (steps) => `Planned path: ${steps} steps`],
    [/^Подтверждённый маршрут: (\d+) шагов$/, (steps) => `Submitted path: ${steps} steps`],
    [/^Ошибка загрузки дополнительных данных: (.+)$/, (reason) => `Extension load failed: ${t(reason)}`],
    [/^Ошибка операции: (.+)$/, (reason) => `Operation failed: ${t(reason)}`],
    [/^Сохранить станцию #(\d+)$/, (id) => `Save Station #${id}`],
    [/^Удалить станцию #(\d+)\?$/, (id) => `Delete Station #${id}?`],
    [/^Удалить (.+)\?$/, (id) => `Delete ${id}?`],
    [/^Откатиться к снимку (.+)\? Текущее состояние будет заменено\.$/, (id) =>
      `Rollback to ${id}? Current live state will be replaced.`],
    [/^([А-ЯЁA-Z_]+) \(макс\. ([\d.]+)\)$/, (resource, max) => `${exact(resource, "en")} (max ${max})`],
    [/^([А-ЯЁA-Z_]+) \(доступно ([\d.]+)\)$/, (resource, amount) => `${exact(resource, "en")} (available ${amount})`],
    [/^БМ (\d+) \| ОЗ (\d+)$/, (cp, hp) => `CP ${cp} | HP ${hp}`],
    [/^(.+) \(вы\)$/, (label) => `${label} (you)`],
    [/^Удалить вид (.+)\? Ссылки юнитов будут очищены\.$/, (name) =>
      `Delete variant ${name}? Unit references will be cleared.`],
    [/^Планета (.+) \(#(\d+)\)$/, (name, id) => `Planet ${name} (#${id})`],
    [/^Станция (.+) \(#(\d+)\)$/, (name, id) => `Station ${name} (#${id})`],
    [/^Планета (.+)$/, (value) => `Planet ${value}`],
    [/^Станция (.+)$/, (value) => `Station ${value}`],
    [/^Выбран отряд\/флот (\d+)$/, (id) => `Selected unit ${id}`],
    [/^Фокус сброшен; камера возвращена к центру глобальной карты$/, () => "Focus reset; camera returned to the world map center"],
    [/^Отправлена конвертация (.+) FUEL в ОД для флота (\d+)$/, (amount, id) =>
      `Conversion of ${amount} FUEL to movement points sent for fleet ${id}`],
    [/^Смена пароля: (.+)$/, (detail) => `Password change: ${detail}`],
    [/^ОШИБКА: (.+)$/, (detail) => `ERROR: ${t(detail)}`],
    [/^УСПЕХ: (.+)$/, (detail) => `OK: ${t(detail)}`],
    [/^Таймер: (.+)$/, (value) => `Timer: ${value}`],
    [/^Ход (\d+) до (.+) · (\d+) с осталось$/, (turn, deadline, seconds) =>
      `Turn ${turn} deadline ${deadline} · ${seconds}s remaining`],
    [/^Сохранить станцию #(\d+)$/, (id) => `Save Station #${id}`],
    [/^Turn (\d+) (.+) · (.+)$/, (turn, point, date) => `Turn ${turn} ${point} · ${date}`],
  ];
  for (const [pattern, render] of patterns) {
    const match = text.match(pattern);
    if (match) return render(...match.slice(1));
  }
  const labelled = text.match(/^([^:]+): (.*)$/);
  if (labelled) {
    const label = exact(labelled[1], "en");
    const value = t(labelled[2]);
    if (label !== labelled[1] || value !== labelled[2]) return `${label}: ${value}`;
  }
  return null;
}

export function t(text: string): string {
  if (text.includes("\n")) return text.split("\n").map(t).join("\n");
  const timestamped = text.match(/^(\[[^\]]+\]\s*)(.+)$/);
  if (timestamped) return `${timestamped[1]}${t(timestamped[2])}`;
  for (const [en, ru] of placeholders.values()) {
    if (text === en || text === ru) return locale === "ru" ? ru : en;
  }
  const translated = exact(text, locale);
  if (translated !== text) return translated;
  if (locale === "en") return englishFromRussian(text) ?? text;
  const operationResult = text.match(/^(OK|ERROR): (.+)$/);
  if (operationResult) {
    return `${operationResult[1] === "OK" ? "УСПЕХ" : "ОШИБКА"}: ${t(operationResult[2])}`;
  }

  const patterns: Array<[RegExp, (...parts: string[]) => string]> = [
    [/^Выбран (отряд|флот): (\d+) \(ОД (\d+)\/(\d+), (ATTACK|DEFENSE)(, pending)?\)$/, (kind, id, current, max, stance, pending) =>
      `Выбран ${kind}: ${id} (ОД ${current}/${max}, ${t(stance)}${pending ? ", ожидает" : ""})`],
    [/^Tithe: (.+); max (.+) \(cap ([\d.]+)\); delivered ([\d.]+)$/, (current, max, cap, delivered) =>
      `Десятина: ${t(current)}; максимум ${t(max)} (лимит ${cap}); выплачено ${delivered}`],
    [/^Logged as (.+) \((admin|player)\)$/, (name, role) =>
      `Выполнен вход: ${name} (${t(role)})`],
    [/^(.+) \((admin|player)\)$/, (name, role) => `${name} (${t(role)})`],
    [/^(Planet|Station|Shipwreck|Anomaly) #(\d+) (.+)$/, (kind, id, rest) =>
      `${t(kind)} #${id} ${rest}`],
    [/^#(\d+) · Turn (\d+) · ([A-Z_]+)$/, (id, turn, kind) =>
      `#${id} · Ход ${turn} · ${eventKindsRu[kind] ?? kind}`],
    [/^(Fleet|Army|Unit) (\d+) moved (\[[^\]]+\]) → (\[[^\]]+\])$/, (kind, id, from, to) =>
      `${unitKindsRu[kind] ?? kind} ${id} перемещён: ${from} → ${to}`],
    [/^(Fleet|Army|Unit) (\d+) received ([\d.]+) damage and was destroyed$/, (kind, id, damage) =>
      `${unitKindsRu[kind] ?? kind} ${id} получил ${damage} урона и уничтожен`],
    [/^(Fleet|Army|Unit) (\d+) received ([\d.]+) damage; HP ([\d.-]+)$/, (kind, id, damage, hp) =>
      `${unitKindsRu[kind] ?? kind} ${id} получил ${damage} урона; здоровье: ${hp}`],
    [/^Players (\d+) and (\d+) are now at war$/, (a, b) => `Игроки ${a} и ${b} теперь находятся в состоянии войны`],
    [/^Players (\d+) and (\d+) formed an alliance$/, (a, b) => `Игроки ${a} и ${b} заключили союз`],
    [/^Detected ([A-Z_]+) (\d+) \((EXACT|ESTIMATED)\)$/, (kind, id, confidence) =>
      `Обнаружен объект «${objectKindsRu[kind] ?? kind}» ${id}; данные: ${confidence === "EXACT" ? "точные" : "оценочные"}`],
    [/^Shipwreck (\d+) formed at (\[[^\]]+\])$/, (id, position) =>
      `Кораблекрушение ${id} образовалось в гексе ${position}`],
    [/^Turn (\d+) resolved: (\d+) validation error\(s\), (\d+) destroyed$/, (turn, errors, destroyed) =>
      `Ход ${turn} обработан: ошибок проверки — ${errors}, уничтожено юнитов — ${destroyed}`],
    [/^Transfer amount must be within 1\.\.(\d+)$/, (max) => `Количество для передачи должно быть от 1 до ${max}`],
    [/^Transfer sent: (.+), (\d+) ([A-Z0-9_]+)$/, (mode, amount, resource) =>
      `Передача отправлена: ${t(mode)}, ${amount} ${resource}`],
    [/^Shop trade rejected locally: (.+)$/, (reason) => `Локальная проверка торговли отклонена: ${t(reason)}`],
    [/^([A-Z_]+) sent for (\d+)$/, (kind, planet) => `${actionKindsRu[kind] ?? kind} отправлено для планеты ${planet}`],
    [/^Raw stock amount must be within 1\.\.(\d+)$/, (max) => `Количество сырья должно быть от 1 до ${max}`],
    [/^Product amount must be within 1\.\.(\d+)$/, (max) => `Количество продукта должно быть от 1 до ${max}`],
    [/^Rolled route back to (.+) \((\d+)\/(\d+) AP\)$/, (hex, used, total) =>
      `Маршрут сокращён до ${hex} (${used}/${total} ОД)`],
    [/^Cannot add obstacle (.+) to route$/, (hex) => `Нельзя добавить препятствие ${hex} в маршрут`],
    [/^Added waypoint (.+) \((\d+)\/(\d+) AP\)$/, (hex, used, total) =>
      `Добавлена точка маршрута ${hex} (${used}/${total} ОД)`],
    [/^Selected (\d+)$/, (id) => `Выбран юнит ${id}`], [/^Deselected (\d+)$/, (id) => `Выбор юнита ${id} снят`],
    [/^Tile (.+) has enemy fleets$/, (hex) => `В гексе ${hex} находятся вражеские флоты`],
    [/^Cannot path to obstacle (.+)$/, (hex) => `Нельзя проложить маршрут к препятствию ${hex}`],
    [/^Route updated for (\d+) \((\d+) steps\)$/, (id, steps) => `Маршрут юнита ${id} обновлён: ${steps} шагов`],
    [/^SET_FLEET_STANCE submitted for (\d+) -> (ATTACK|DEFENSE)$/, (id, stance) =>
      `Смена стойки флота ${id} отправлена: ${stance === "ATTACK" ? "атака" : "защита"}`],
    [/^(DECLARE_WAR|PROPOSE_ALLIANCE) submitted -> (\d+)$/, (kind, target) =>
      `${kind === "DECLARE_WAR" ? "Объявление войны" : "Предложение союза"} отправлено игроку ${target}`],
    [/^Traded (\d+) resources for (\d+) ([A-Z0-9_]+)$/, (paid, received, resource) =>
      `Обменено ${paid} ед. ресурсов на ${received} ${resource}`],
    [/^Payment must total exactly (\d+) (RAW|PRODUCT)$/, (amount, category) =>
      `Оплата должна составлять ровно ${amount} ед. категории ${category}`],
    [/^Fleet lacks (\d+) ([A-Z0-9_]+)$/, (amount, resource) => `Во флоте не хватает ${amount} ${resource}`],
    [/^Artifact (.+) transferred$/, (id) => `Артефакт ${id} передан`],
    [/^Target already knows (.+)$/, (code) => `Целевой инвентарь уже содержит знание ${code}`],
    [/^Knowledge (.+) copied$/, (code) => `Знание ${code} скопировано`],
    [/^Unknown artifact effect: (.+)$/, (code) => `Неизвестный эффект артефакта: ${code}`],
    [/^Source does not have ([A-Z0-9_]+)$/, (resource) => `В источнике нет ресурса ${resource}`],
    [/^Failed to take ([A-Z0-9_]+) from source$/, (resource) => `Не удалось забрать ${resource} из источника`],
    [/^Fleet (\d+) has no free capacity$/, (id) => `Во флоте ${id} нет свободной вместимости`],
    [/^Transferred (\d+) ([A-Z0-9_]+) from ([A-Z_]+):(\d+) to ([A-Z_]+):(\d+)$/, (amount, resource, fromKind, fromId, toKind, toId) =>
      `Передано ${amount} ${resource}: ${endpointKindsRu[fromKind] ?? fromKind} ${fromId} → ${endpointKindsRu[toKind] ?? toKind} ${toId}`],
    [/^Army disembarked on (\d+)$/, (planet) => `Армия высажена на планету ${planet}`],
    [/^player (\d+) gained (\d+) ([A-Z_]+) intel$/, (player, amount, category) =>
      `Игрок ${player} получил ${amount} фрагм. информации категории ${category}`],
    [/^tithe set to ([A-Z0-9_]+) \(([\d.]+)\)$/, (level, target) =>
      `Уровень десятины установлен: ${level}; цель — ${target}`],
    [/^generated (.+) into (raw stock|Shop)$/, (resources, target) =>
      `Произведено ${resources}; поступление: ${target === "Shop" ? "магазин" : "сырьевой склад"}`],
    [/^(\d+) took ([\d.]+) ([A-Z0-9_]+) from raw stock$/, (fleet, amount, resource) =>
      `Флот ${fleet} изъял ${amount} ${resource} из сырьевого склада`],
    [/^(\d+) raided ([\d.]+) ([A-Z0-9_]+) from Shop$/, (fleet, amount, resource) =>
      `Флот ${fleet} награбил ${amount} ${resource} из магазина`],
    [/^(\d+) took ([\d.]+) ([A-Z0-9_]+) from product storage$/, (fleet, amount, resource) =>
      `Флот ${fleet} получил ${amount} ${resource} со склада продукции`],
    [/^(\d+) deposited ([\d.]+) ([A-Z0-9_]+) to product storage$/, (fleet, amount, resource) =>
      `Флот ${fleet} передал ${amount} ${resource} на склад продукции`],
    [/^converted ([\d.]+) ([A-Z0-9_]+) into ([\d.]+) ([A-Z0-9_]+) \(rate ([\d.]+)\)$/, (input, inputResource, output, outputResource, rate) =>
      `Переработано ${input} ${inputResource} в ${output} ${outputResource}; коэффициент ${rate}`],
    [/^morale increased to (\d+)$/, (morale) => `Мораль повышена до ${morale}`],
    [/^([A-Z_]+) informant scheduled for turn (\d+)$/, (category, turn) =>
      `Информатор категории ${category} запланирован на ход ${turn}`],
    [/^planet requires tag ([A-Z0-9_]+)$/, (tag) => `Планете требуется тег ${tag}`],
    [/^not enough ([A-Z0-9_]+) in fleets inventory$/, (resource) => `В инвентарях флотов недостаточно ${resource}`],
    [/^unsupported action kind (.+)$/, (kind) => `Неподдерживаемый вид действия: ${kind}`],
    [/^(.+) is not an immediate economy action$/, (kind) => `${kind} не является немедленным экономическим действием`],
    [/^Admin (POST|DELETE) (.+) success$/, (method, path) => `Административная операция ${method} ${path} выполнена`],
    [/^Admin (POST|DELETE) (.+) failed: (.+)$/, (method, path, reason) =>
      `Ошибка административной операции ${method} ${path}: ${reason}`],
    [/^(Player|Faction|Planet|Fleet) (.+) updated$/, (kind, id) =>
      `${({ Player: "Игрок", Faction: "Фракция", Planet: "Планета", Fleet: "Флот" } as Record<string, string>)[kind]} ${id}: данные обновлены`],
    [/^(Player|Faction|Planet|Fleet) (.+) deleted$/, (kind, id) => {
      const phrase = ({ Player: "Игрок удалён", Faction: "Фракция удалена", Planet: "Планета удалена", Fleet: "Флот удалён" } as Record<string, string>)[kind];
      return `${phrase}: ${id}`;
    }],
    [/^(Player|Faction|Planet) (.+) created$/, (kind, id) => {
      const phrase = ({ Player: "Игрок создан", Faction: "Фракция создана", Planet: "Планета создана" } as Record<string, string>)[kind];
      return `${phrase}: ${id}`;
    }],
    [/^(Player|Faction|Planet|Fleet|Army) (update|delete|create) failed: (.+)$/, (kind, operation, reason) => {
      const entity = ({ Player: "игрока", Faction: "фракции", Planet: "планеты", Fleet: "флота", Army: "армии" } as Record<string, string>)[kind];
      const action = ({ update: "обновления", delete: "удаления", create: "создания" } as Record<string, string>)[operation];
      return `Ошибка ${action} ${entity}: ${reason}`;
    }],
    [/^Conversion rate for ([A-Z0-9_]+) must be positive$/, (product) => `Коэффициент преобразования ${product} должен быть положительным`],
    [/^Conversion rate for ([A-Z0-9_]+) is too small after rounding$/, (product) => `Коэффициент преобразования ${product} слишком мал после округления`],
    [/^Conversion rate update failed: (.+)$/, (reason) => `Ошибка обновления коэффициентов преобразования: ${reason}`],
    [/^Relation (removed|added): (\d+)\/(\d+) (WAR|ALLIANCE)$/, (operation, a, b, kind) =>
      `Отношение ${kind === "WAR" ? "«война»" : "«союз»"} игроков ${a}/${b} ${operation === "added" ? "добавлено" : "удалено"}`],
    [/^Relation mutation failed: (.+)$/, (reason) => `Ошибка изменения отношений: ${reason}`],
    [/^Admin data reload failed: (.+)$/, (reason) => `Ошибка обновления административных данных: ${reason}`],
    [/^State snapshot failed: (.+)$/, (reason) => `Не удалось загрузить снимок состояния: ${reason}`],
    [/^Logged in as (.+)$/, (username) => `Выполнен вход: ${username}`],
    [/^Player: (.+)$/, (value) => `Игрок: ${value}`], [/^Planet: (.+)$/, (value) => `Планета: ${value}`],
    [/^([A-Z0-9_]+) \(max ([\d.]+)\)$/, (resource, max) => `${t(resource)} (макс. ${max})`],
    [/^([A-Z0-9_]+) \(available ([\d.]+)\)$/, (resource, amount) => `${t(resource)} (доступно ${amount})`],
    [/^([A-Z0-9_]+): ([\d.]+)$/, (resource, amount) => `${t(resource)}: ${amount}`],
    [/^Shop trade failed: (.+)$/, (reason) => `Ошибка торговли: ${t(reason)}`],
    [/^Extension load failed: (.+)$/, (reason) => `Ошибка загрузки дополнительных данных: ${t(reason)}`],
    [/^Operation failed: (.+)$/, (reason) => `Ошибка операции: ${t(reason)}`],
    [/^Save Station #(\d+)$/, (id) => `Сохранить станцию #${id}`],
    [/^Delete Station #(\d+)\?$/, (id) => `Удалить станцию #${id}?`],
    [/^Delete (.+)\?$/, (id) => `Удалить ${id}?`],
    [/^Rollback to (.+)\? Current live state will be replaced\.$/, (id) =>
      `Откатиться к снимку ${id}? Текущее состояние будет заменено.`],
    [/^Turn (\d+) deadline (.+) · (\d+)s remaining$/, (turn, deadline, seconds) =>
      `Ход ${turn} до ${deadline} · осталось ${seconds} с`],
    [/^Turn (\d+) (START|END) · (.+)$/, (turn, point, date) =>
      `Ход ${turn} ${point === "START" ? "начало" : "конец"} · ${date}`],
    [/^Shipwreck #(\d+)$/, (id) => `Кораблекрушение #${id}`],
    [/^Anomaly #(\d+)$/, (id) => `Аномалия #${id}`],
    [/^CP (\d+) \| HP (\d+)$/, (cp, hp) => `БМ ${cp} | ОЗ ${hp}`],
    [/^(.+) \(you\)$/, (label) => `${label} (вы)`],
    [/^Hex: q=(-?\d+), r=(-?\d+)$/, (q, r) => `Гекс: q=${q}, r=${r}`],
    [/^([A-Z0-9_]+) ← ([A-Z0-9_]+)$/, (output, input) => `${t(output)} ← ${t(input)}`],
    [/^([A-Z0-9_]+) \(([\d.]+)\)$/, (resource, amount) => `${t(resource)} (${amount})`],
    [/^Hex: (.+)$/, (value) => `Гекс: ${value}`], [/^Hex (.+)$/, (value) => `Гекс ${value}`],
    [/^Logged as (.+)$/, (value) => `Выполнен вход: ${value}`], [/^Connected to (.+)$/, (value) => `Подключено к ${value}`],
    [/^Selected fleet: (.+)$/, (value) => `Выбран флот: ${value}`], [/^Selected army: (.+)$/, (value) => `Выбрана армия: ${value}`],
    [/^Planned path: (\d+) steps$/, (n) => `Маршрут: ${n} шагов`], [/^Draft path: (\d+) steps$/, (n) => `Маршрут: ${n} шагов`],
    [/^Submitted path: (\d+) steps$/, (n) => `Подтверждённый маршрут: ${n} шагов`],
    [/^Army (.+) requests (.+)$/, (army, fleet) => `Армия ${army} запрашивает погрузку на ${fleet}`],
    [/^Embarked army (.+)$/, (army) => `Погруженная армия ${army}`],
    [/^Planet (.+)$/, (value) => `Планета ${value}`],
    [/^Position: (.+)$/, (value) => `Позиция: ${value}`], [/^Combat Power: (.+)$/, (value) => `Боевая мощь: ${value}`],
    [/^Health: (.+)$/, (value) => `Здоровье: ${value}`], [/^Influence: (.+)$/, (value) => `Влияние: ${value}`],
    [/^Action Points: (.+)$/, (value) => `Очки действий: ${value}`], [/^Vision Range: (.+)$/, (value) => `Дальность видимости: ${value}`],
    [/^Capacity: (.+)$/, (value) => `Вместимость: ${value}`], [/^Stance: (.+)$/, (value) => `Стойка: ${value}`],
    [/^Unit: (.+)$/, (value) => `Юнит: ${value}`], [/^Carrier: (.+)$/, (value) => `Транспорт: ${value}`],
    [/^Inventory: (.+)$/, (value) => `Инвентарь: ${value}`], [/^World type: (.+)$/, (value) => `Тип мира: ${value}`],
    [/^Your Product Storage: (.+)$/, (value) => `Ваш склад продуктов: ${value}`],
    [/^Population: (.+)$/, (value) => `Население: ${value}`], [/^Morale: (.+)$/, (value) => `Мораль: ${value}`],
  ];
  for (const [pattern, render] of patterns) {
    const match = text.match(pattern);
    if (match) return localizeCodes(render(...match.slice(1)), "ru");
  }
  const labelled = text.match(/^([^:]+): (.*)$/);
  if (labelled) return `${exact(labelled[1], "ru")}: ${t(labelled[2])}`;
  return localizeCodes(text, "ru");
}

// Useful for non-DOM renderers and for checking both catalog directions.
export function translate(text: string, language: Locale): string {
  const previous = locale;
  locale = language;
  try {
    return t(text);
  } finally {
    locale = previous;
  }
}

function translateTextNode(node: Text, refreshSource: boolean): void {
  const raw = node.data;
  const match = raw.match(/^(\s*)(.*?)(\s*)$/s);
  if (!match || !match[2]) return;
  if (refreshSource || !sourceByTextNode.has(node)) sourceByTextNode.set(node, match[2]);
  const source = sourceByTextNode.get(node) ?? match[2];
  const next = `${match[1]}${t(source)}${match[3]}`;
  if (node.data !== next) {
    internalTextUpdates.add(node);
    node.data = next;
  }
}

function translateElement(root: ParentNode, refreshSource = false): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const parent = current.parentElement;
    if (parent?.closest("script,style,code,[data-i18n-ignore]")) continue;
    translateTextNode(current as Text, refreshSource);
  }
  const inputs = root instanceof Element && root.matches("input[placeholder]")
    ? [root as HTMLInputElement]
    : [...root.querySelectorAll<HTMLInputElement>("input[placeholder]")];
  for (const input of inputs) {
    if (refreshSource || !sourcePlaceholder.has(input)) sourcePlaceholder.set(input, input.placeholder);
    const source = sourcePlaceholder.get(input) ?? input.placeholder;
    const pair = placeholders.get(source);
    input.placeholder = pair ? pair[locale === "ru" ? 1 : 0] : t(source);
  }

  const attributed = root instanceof Element
    ? [root, ...root.querySelectorAll<Element>("[title],[aria-label]")]
    : [...root.querySelectorAll<Element>("[title],[aria-label]")];
  for (const element of attributed) {
    const sources = sourceAttributes.get(element) ?? new Map<string, string>();
    for (const attribute of ["title", "aria-label"]) {
      const value = element.getAttribute(attribute);
      if (value === null) continue;
      if (refreshSource || !sources.has(attribute)) sources.set(attribute, value);
      element.setAttribute(attribute, t(sources.get(attribute) ?? value));
    }
    sourceAttributes.set(element, sources);
  }

  const groups = root instanceof HTMLOptGroupElement
    ? [root]
    : [...root.querySelectorAll<HTMLOptGroupElement>("optgroup[label]")];
  for (const group of groups) {
    if (refreshSource || !sourceOptgroupLabel.has(group)) {
      sourceOptgroupLabel.set(group, group.label);
    }
    group.label = t(sourceOptgroupLabel.get(group) ?? group.label);
  }
}

function applyLocale(): void {
  applying = true;
  document.documentElement.lang = locale;
  translateElement(document);
  document.title = t(document.title === "40k Штаб — тактическая карта" ? "40k Headquarters - Tactical View"
    : document.title === "40k Штаб — администрирование" ? "40k Headquarters - Admin" : document.title);
  const button = document.getElementById("languageToggle");
  if (button) {
    button.textContent = locale === "en" ? "EN" : "RU";
    button.setAttribute("aria-label", locale === "en" ? "Switch to Russian" : "Переключить на английский");
  }
  window.dispatchEvent(new Event("game-language-change"));
  applying = false;
}

export function initLocalization(): void {
  const stored = localStorage.getItem(STORAGE_KEY);
  locale = stored === "ru" || stored === "en" ? stored : "en";
  const button = document.createElement("button");
  button.id = "languageToggle";
  button.type = "button";
  button.className = "language-toggle ghost";
  button.addEventListener("click", () => {
    locale = locale === "en" ? "ru" : "en";
    localStorage.setItem(STORAGE_KEY, locale);
    applyLocale();
  });
  let meta = document.querySelector<HTMLElement>(".meta");
  if (!meta) {
    const header = document.querySelector<HTMLElement>(".admin-topbar, .topbar");
    meta = document.createElement("div");
    meta.className = "meta";
    const existingRightItem = header?.querySelector<HTMLElement>(".back-link");
    if (existingRightItem) meta.append(existingRightItem);
    (header ?? document.body).append(meta);
  }
  meta.append(button);
  const style = document.createElement("style");
  style.textContent = ".meta{display:flex;align-items:center;gap:16px}.meta .language-toggle{position:static;width:auto;min-width:48px;margin:0;padding:6px 10px;flex:0 0 auto;font-weight:700}";
  document.head.append(style);
  applyLocale();

  new MutationObserver((records) => {
    if (applying) return;
    applying = true;
    for (const record of records) {
      if (record.type === "characterData") {
        const textNode = record.target as Text;
        if (internalTextUpdates.has(textNode)) {
          internalTextUpdates.delete(textNode);
        } else {
          translateTextNode(textNode, true);
        }
      }
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, true);
        else if (node instanceof Element) translateElement(node, true);
      }
    }
    applying = false;
  }).observe(document.body, { childList: true, characterData: true, subtree: true });
}
