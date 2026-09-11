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

const eventKindsRu: Readonly<Record<string, string>> = {
  MOVEMENT: "Перемещение", COMBAT: "Бой", DIPLOMACY: "Дипломатия",
  SYSTEM: "Система", DETECTION: "Обнаружение", SHOP: "Магазин", SHIPWRECK: "Кораблекрушение",
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
const internalTextUpdates = new WeakSet<Text>();

function exact(text: string, language: Locale): string {
  for (const [en, ru] of messages) {
    if (text === en || text === ru) return language === "ru" ? ru : en;
  }
  return text;
}

export function t(text: string): string {
  if (text.includes("\n")) return text.split("\n").map(t).join("\n");
  const translated = exact(text, locale);
  if (translated !== text) return translated;
  if (locale === "en") return text;
  const timestamped = text.match(/^(\[[^\]]+\]\s*)(.+)$/);
  if (timestamped) return `${timestamped[1]}${t(timestamped[2])}`;
  const operationResult = text.match(/^(OK|ERROR): (.+)$/);
  if (operationResult) {
    return `${operationResult[1] === "OK" ? "УСПЕХ" : "ОШИБКА"}: ${t(operationResult[2])}`;
  }

  const patterns: Array<[RegExp, (...parts: string[]) => string]> = [
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
    if (match) return render(...match.slice(1));
  }
  return text;
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
    input.placeholder = pair ? pair[locale === "ru" ? 1 : 0] : source;
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
  const button = document.getElementById("languageToggle");
  if (button) {
    button.textContent = locale === "en" ? "EN" : "RU";
    button.setAttribute("aria-label", locale === "en" ? "Switch to Russian" : "Переключить на английский");
  }
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
