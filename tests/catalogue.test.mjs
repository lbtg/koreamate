import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { purposes } from "../server/app.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = readFileSync(join(ROOT, "src/main.jsx"), "utf8");
const backend = readFileSync(join(ROOT, "server/app.mjs"), "utf8");

// The two lists are written separately — one for the dropdown, one for validation —
// and a key present in only one of them means a visitor picks a city the API then
// rejects with 请选择城市及服务类别.
const block = (src, start) => {
  const from = src.indexOf(start);
  assert.notEqual(from, -1, `missing ${start}`);
  return src.slice(from, src.indexOf("\n};", from) + 1);
};
const objectKeys = (src, start) =>
  [...block(src, start).matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);

const arrayValues = (src, start) => {
  const from = src.indexOf(start);
  assert.notEqual(from, -1, `missing ${start}`);
  const text = src.slice(from, src.indexOf("\n];", from));
  return [...text.matchAll(/"([\w]+)"/g)].map((m) => m[1]);
};

test("the city catalogue matches the one the API accepts", () => {
  const offered = objectKeys(frontend, "const cities = {");
  const accepted = arrayValues(backend, "const cities = [");
  assert.ok(
    offered.length > 50,
    `expected the full list, got ${offered.length}`,
  );
  assert.deepEqual([...offered].sort(), [...accepted].sort());
  assert.equal(new Set(offered).size, offered.length, "duplicate city key");
});

test("every offered city sits in exactly one province group", () => {
  const offered = objectKeys(frontend, "const cities = {");
  const grouped = [
    ...block(frontend, "const cityGroups = [").matchAll(/"([a-z_]+)"/g),
  ]
    .map((m) => m[1])
    .filter((k) => offered.includes(k));
  assert.deepEqual([...grouped].sort(), [...offered].sort());
  assert.equal(new Set(grouped).size, grouped.length, "city in two groups");
});

test("the service scenes match the ones the API accepts", () => {
  const offered = objectKeys(frontend, "const purposes = {");
  assert.deepEqual([...offered].sort(), [...purposes].sort());
});
