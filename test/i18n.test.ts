import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { translate } from "../client/src/i18n";

test("static page copy has a translation in both directions", () => {
  const technical = new Set(["Q", "R", "q", "r", "JSON", "-", "12, 34"]);
  for (const page of ["client/index.html", "client/admin.html"]) {
    const html = readFileSync(page, "utf8");
    const texts = [...html.matchAll(/>([^<>]+)</g)]
      .map((match) => match[1].replace(/&amp;/g, "&").trim())
      .filter((value) => /[A-Za-zА-Яа-яЁё]/.test(value)
        && !technical.has(value) && !value.startsWith("/") && !value.startsWith("?api="));
    const missing = texts.filter((value) =>
      /[А-Яа-яЁё]/.test(value)
        ? translate(value, "en") === value
        : translate(value, "ru") === value,
    );
    assert.deepEqual(missing, [], `${page}: untranslated static text`);
    const attributes = [...html.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((value) => /[A-Za-zА-Яа-яЁё]/.test(value)
        && !technical.has(value) && !/^[\[{]/.test(value));
    const missingAttributes = attributes.filter((value) =>
      /[А-Яа-яЁё]/.test(value)
        ? translate(value, "en") === value
        : translate(value, "ru") === value,
    );
    assert.deepEqual(missingAttributes, [], `${page}: untranslated attributes`);
  }
});

test("server events, domain codes and map labels translate without changing stored values", () => {
  assert.equal(translate("FOOD_RAW", "ru"), "ПИЩЕВОЕ СЫРЬЁ");
  assert.equal(translate("ПИЩЕВОЕ СЫРЬЁ", "en"), "FOOD_RAW");
  assert.equal(translate("Обнаружен объект: станция 3 (точно)", "en"), "Detected STATION 3 (EXACT)");
  assert.equal(translate("Флот 2 перемещён [0,0] → [1,0]", "en"), "Fleet 2 moved [0,0] → [1,0]");
  assert.equal(translate("Администратум изменил десятину мира 4: ADEPTUS_NON", "en"),
    "Administratum changed world 4 tithe: ADEPTUS_NON");
  assert.equal(translate("CP 10 | HP 20", "ru"), "БМ 10 | ОЗ 20");
  assert.equal(translate("Сбросить фокус", "en"), "Reset focus");
  assert.equal(translate("[12:30] Флот 2 перемещён [0,0] → [1,0]", "en"),
    "[12:30] Fleet 2 moved [0,0] → [1,0]");
  assert.equal(translate("#9 · Turn 3 · ADMINISTRATUM", "ru"), "#9 · Ход 3 · Администратум");
  assert.equal(translate("#9 · Ход 3 · Администратум", "en"), "#9 · Turn 3 · ADMINISTRATUM");
  assert.equal(translate("Logged as Alice (admin)", "ru"), "Выполнен вход: Alice (администратор)");
  assert.equal(translate("Tithe: ADEPTUS_NON; max DECUMA_PRIMA (cap 8); delivered 3", "ru"),
    "Десятина: ADEPTUS_NON; максимум DECUMA_PRIMA (лимит 8); выплачено 3");
  assert.equal(translate("Operation failed: Неверный пароль секретного хранилища", "en"),
    "Operation failed: Incorrect secret storage password");
  assert.equal(translate("Login failed: Fleet does not exist", "ru"),
    "Ошибка входа: Флот не существует");
});

test("static server result messages have both language versions", () => {
  const files = [
    ...readdirSync("src/systems").filter((name) => name.endsWith(".ts")).map((name) => `src/systems/${name}`),
    ...readdirSync("src/server/realtime").filter((name) => name.endsWith(".ts")).map((name) => `src/server/realtime/${name}`),
  ];
  const missing: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(/\bmessage:\s*"([^"]+)"/g)) {
      const value = match[1].trim();
      if (value.endsWith("#") || value.endsWith(":")) continue;
      if (!/[A-Za-zА-Яа-яЁё]/.test(value)) continue;
      const target = /[А-Яа-яЁё]/.test(value) ? "en" : "ru";
      const rendered = translate(value, target);
      if (target === "ru" ? /[a-z]{3,}/i.test(rendered.replace(/\bJSON\b/g, "")) : /[А-Яа-яЁё]/.test(rendered)) {
        missing.push(`${file}: ${value} => ${rendered}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("static client status and form labels are localized", () => {
  const files = [
    "client/src/main.ts", "client/src/admin.ts", "client/src/adminExtensions.ts",
    "client/src/ui/hud.ts", "client/src/ui/contextMenu.ts",
    "client/src/ui/resourceTransferController.ts", "client/src/ui/shopTradeController.ts",
  ];
  const missing: string[] = [];
  const literal = /(?:textContent\s*=|createTextNode\(|createLabeledField\(|appendEvent\(|window\.confirm\()\s*"([^"\n]+)"/g;
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(literal)) {
      const value = match[1].trim();
      if (value.endsWith("#") || value.endsWith(":")) continue;
      if (!/[A-Za-zА-Яа-яЁё]/.test(value) || value.startsWith("/")) continue;
      const target = /[А-Яа-яЁё]/.test(value) ? "en" : "ru";
      const rendered = translate(value, target);
      if (target === "ru" ? /[a-z]{3,}/i.test(rendered.replace(/\bJSON\b/g, "")) : /[А-Яа-яЁё]/.test(rendered)) {
        missing.push(`${file}: ${value} => ${rendered}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
