export type Locale = "en" | "ru";

const STORAGE_KEY = "40khq.locale";

const messages = [
  ["Authentication", "Авторизация"], ["Username", "Имя пользователя"], ["Password", "Пароль"],
  ["Login", "Войти"], ["Logout", "Выйти"], ["Not authenticated", "Не авторизован"],
  ["User", "Пользователь"], ["Turn", "Ход"], ["Phase", "Фаза"], ["Resources", "Ресурсы"],
  ["Not logged in", "Вход не выполнен"], ["Connection", "Соединение"],
  ["Unit Orders", "Приказы юнитам"], ["Clear Path", "Очистить маршрут"],
  ["Set Attack", "Атакующая стойка"], ["Set Defense", "Защитная стойка"],
  ["Ally visibility", "Видимость для союзников"], ["Видимость для союзников", "Видимость для союзников"],
  ["Army Transport", "Транспортировка армии"], ["Fleet in the same hex", "Флот в том же гексе"],
  ["Request embark", "Запросить погрузку"], ["Disembark on planet", "Высадиться на планету"],
  ["Accept", "Принять"], ["Decline", "Отказать"], ["Resource Transfer", "Передача ресурсов"],
  ["Fleet inventory and planet product storage.", "Инвентарь флота и хранилище продукции планеты."],
  ["Transfer mode", "Режим передачи"], ["Target fleet (same hex)", "Целевой флот (тот же гекс)"],
  ["Resource", "Ресурс"], ["Amount", "Количество"], ["Transfer", "Передать"],
  ["Planet Actions", "Действия планеты"], ["Raw stock", "Сырьевые запасы"],
  ["Take Stock", "Забрать запасы"], ["Raid Stock", "Разграбить запасы"], ["Produce", "Произвести"],
  ["Product", "Продукт"], ["Create Product", "Создать продукт"], ["Raise Morale", "Повысить мораль"],
  ["Deploy Informant", "Внедрить информатора"], ["Info category", "Категория информации"],
  ["Tithe level", "Уровень десятины"], ["Set Tithe", "Установить десятину"],
  ["Diplomacy", "Дипломатия"], ["Target player", "Целевой игрок"], ["Declare War", "Объявить войну"],
  ["Propose Alliance", "Предложить союз"], ["Turn Control", "Управление ходом"],
  ["Player Ready", "Игрок готов"], ["End Turn (Admin)", "Завершить ход (админ)"],
  ["Admin Panel", "Панель администратора"], ["Add Player", "Добавить игрока"],
  ["Add Planet", "Добавить планету"], ["Add Fleet", "Добавить флот"], ["Add Army", "Добавить армию"], ["Events", "События"],
  ["Relations", "Отношения"], ["Alliances", "Союзы"], ["Wars", "Войны"], ["Close", "Закрыть"],
  ["Reset", "Сбросить"], ["Players", "Игроки"], ["Factions", "Фракции"], ["Planets", "Планеты"],
  ["Fleets", "Флоты"], ["Armies", "Армии"], ["Player ID", "ID игрока"], ["Name", "Название"], ["Unit color", "Цвет юнитов"],
  ["Owner Player", "Игрок-владелец"], ["Placement", "Размещение"], ["Destination", "Место назначения"],
  ["Planet", "Планета"], ["Fleet", "Флот"],
  ["Alignment", "Сторона"], ["Faction", "Фракция"], ["Faction ID", "ID фракции"],
  ["Faction Name", "Название фракции"], ["Description", "Описание"], ["Add Faction", "Добавить фракцию"],
  ["Planet ID", "ID планеты"], ["World Type", "Тип мира"], ["World Tags (comma)", "Теги мира (через запятую)"],
  ["Population", "Население"], ["Morale", "Мораль"], ["Tithe Level", "Уровень десятины"],
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
] as const;

const placeholders = new Map<string, readonly [string, string]>([
  ["player id", ["player id", "ID игрока"]], ["player name", ["player name", "имя игрока"]],
  ["name", ["name", "название"]], ["username (optional)", ["username (optional)", "имя пользователя (необязательно)"]],
  ["password (optional)", ["password (optional)", "пароль (необязательно)"]],
  ["faction id", ["faction id", "ID фракции"]], ["faction name", ["faction name", "название фракции"]],
  ["description (optional)", ["description (optional)", "описание (необязательно)"]],
  ["planet id", ["planet id", "ID планеты"]], ["fleet id", ["fleet id", "ID флота"]],
  ["Quick search players...", ["Quick search players...", "Быстрый поиск игроков..."]],
  ["Quick search factions...", ["Quick search factions...", "Быстрый поиск фракций..."]],
  ["Quick search planets...", ["Quick search planets...", "Быстрый поиск планет..."]],
  ["Quick search fleets...", ["Quick search fleets...", "Быстрый поиск флотов..."]],
  ["Quick search relations...", ["Quick search relations...", "Быстрый поиск отношений..."]],
]);

let locale: Locale = "en";
let applying = false;
const sourceByTextNode = new WeakMap<Text, string>();
const sourcePlaceholder = new WeakMap<HTMLInputElement, string>();
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

  const patterns: Array<[RegExp, (...parts: string[]) => string]> = [
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
