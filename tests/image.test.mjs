// The runtime container copies only `server` and `dist`, not the whole repo, so a
// server file importing out of `src/` starts fine in development and in the test
// suite — both run from the repository root — and then cannot resolve the import
// inside the image. The failure appears at container start, after a green build and
// a green test run, which is the worst place to learn about it.
//
// This test reads what the server actually imports and what the Dockerfile actually
// copies, and makes them agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

test("every src/ file the server imports is in the runtime image", () => {
  const dockerfile = readFileSync(join(ROOT, "Dockerfile"), "utf8");
  // The runtime stage is everything after the final FROM.
  const runtime = dockerfile.slice(dockerfile.lastIndexOf("\nFROM "));

  const imported = new Set();
  for (const name of readdirSync(join(ROOT, "server"))) {
    if (!name.endsWith(".mjs") && !name.endsWith(".js")) continue;
    const body = readFileSync(join(ROOT, "server", name), "utf8");
    for (const m of body.matchAll(/from\s+["']\.\.\/(src\/[^"']+)["']/g))
      imported.add(m[1]);
  }

  const missing = [...imported].filter(
    (file) => !runtime.includes(`COPY ${file} `),
  );
  assert.deepEqual(
    missing,
    [],
    `server imports these out of src/, but the Dockerfile runtime stage does not COPY them — ` +
      `the container will crash on start:\n  ${missing.join("\n  ")}\n` +
      `Add a line like: COPY ${missing[0] || "src/x.js"} ./${missing[0] || "src/x.js"}`,
  );
});
