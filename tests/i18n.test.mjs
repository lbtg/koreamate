import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { KO, translate, langOf } from "../server/i18n.mjs";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "../server");

// Messages built at runtime rather than written as literals; translate() matches these
// by shape, so they are checked separately below instead of against the dictionary.
const DYNAMIC = [/^请输入 .* 至 .* 的整数$/];

const messages = () => {
  const found = new Map();
  for (const file of readdirSync(SERVER).filter((f) => f.endsWith(".mjs"))) {
    const src = readFileSync(join(SERVER, file), "utf8");
    for (const m of src.matchAll(
      /\b(?:fail|error|Error)\(\s*"((?:[^"\\]|\\.)*)"/g,
    )) {
      const text = m[1].replace(/\\n/g, "\n");
      if (/[一-鿿]/.test(text) && !found.has(text))
        found.set(text, file);
    }
  }
  return found;
};

test("every Chinese message the API can return has Korean", () => {
  const missing = [];
  for (const [text, file] of messages()) {
    if (DYNAMIC.some((re) => re.test(text))) continue;
    if (!KO[text]) missing.push(`${file}: ${text}`);
  }
  assert.deepEqual(
    missing,
    [],
    `缺少韩语翻译 / 한국어 번역 누락:\n${missing.join("\n")}`,
  );
});

test("translate only swaps language when the reader asked for Korean", () => {
  assert.equal(translate("邮箱已注册", "zh"), "邮箱已注册");
  assert.equal(translate("邮箱已注册", "ko"), "이미 가입된 이메일입니다");
  // An unknown message must still reach the reader rather than becoming blank.
  assert.equal(translate("未知消息", "ko"), "未知消息");
  assert.equal(
    translate("请输入 1 至 12 的整数", "ko"),
    "1 이상 12 이하의 정수를 입력해 주세요",
  );
});

test("language comes from the request header and defaults to Chinese", () => {
  assert.equal(langOf({ headers: { "x-lang": "ko" } }), "ko");
  assert.equal(langOf({ headers: { "x-lang": "KO" } }), "ko");
  assert.equal(langOf({ headers: { "x-lang": "zh" } }), "zh");
  assert.equal(langOf({ headers: {} }), "zh");
});
