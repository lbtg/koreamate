import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { paymentDeepLink, validateApiOrigin } from "../src/mobile-runtime.js";
test("native gateway configuration and payment links fail closed", () => {
  assert.equal(validateApiOrigin("https://example.com"), "https://example.com");
  for (const bad of [
    "http://example.com",
    "https://u:p@example.com",
    "https://example.com/api",
    "https://example.com?token=x",
  ])
    assert.throws(() => validateApiOrigin(bad));
  assert.equal(
    paymentDeepLink(
      "koreamate://payments/success?paymentKey=k&orderId=o&amount=100&redirect=https://evil.test",
    ),
    "/payments/success?paymentKey=k&orderId=o&amount=100",
  );
  for (const bad of [
    "https://payments/success",
    "koreamate://admin/success",
    "koreamate://payments/cancel",
  ])
    assert.equal(paymentDeepLink(bad), null);
});
test("service worker never intercepts private API, payment, or mutation requests", () => {
  const listeners = {};
  runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    {
      URL,
      self: {
        location: { origin: "https://km.test" },
        addEventListener: (name, handler) => (listeners[name] = handler),
      },
      fetch: () => Promise.resolve("network"),
    },
  );
  for (const [path, method] of [
    ["/api/session", "GET"],
    ["/api/conversations", "GET"],
    ["/payments/success", "GET"],
    ["/orders", "POST"],
  ]) {
    let intercepted = false;
    listeners.fetch({
      request: { url: "https://km.test" + path, method, mode: "navigate" },
      respondWith: () => {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false, path);
  }
  let intercepted = false;
  listeners.fetch({
    request: { url: "https://km.test/orders", method: "GET", mode: "navigate" },
    respondWith: () => {
      intercepted = true;
    },
  });
  assert.equal(intercepted, true);
});
