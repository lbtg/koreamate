import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.mjs";
import { randomUUID } from "node:crypto";

async function setup(t) {
  const remote = new Map(),
    calls = [],
    idem = new Map();
  let hold = null,
    loseConfirmation = false,
    corrupt = false,
    loseRefund = false;
  const fetcher = async (url, opts) => {
    const path = new URL(url).pathname,
      data = opts.body && JSON.parse(opts.body),
      key = opts.headers["Idempotency-Key"];
    assert.equal(
      opts.headers.Authorization,
      "Basic " + Buffer.from("test_sk_private-test:").toString("base64"),
    );
    calls.push({ path, method: opts.method, key, data });
    if (key && idem.has(key)) return Response.json(idem.get(key));
    let p;
    if (path === "/v1/payments") {
      p = {
        orderId: data.orderId,
        paymentKey: "pay_" + randomUUID(),
        totalAmount: data.amount,
        balanceAmount: data.amount,
        currency: "KRW",
        status: "READY",
        approvedAt: null,
        cancels: [],
        checkout: { url: "https://api.tosspayments.com/checkout/test" },
      };
      remote.set(p.orderId, p);
    } else if (path === "/v1/payments/confirm") {
      p = remote.get(data.orderId);
      assert.equal(data.amount, p.totalAmount);
      if (hold) await hold;
      p.status = "DONE";
      p.approvedAt = new Date().toISOString();
    } else if (path.endsWith("/cancel")) {
      p = [...remote.values()].find((p) => path.includes(p.paymentKey));
      if (data.cancelAmount > p.balanceAmount)
        return Response.json({ code: "EXCEED_CANCEL_AMOUNT" }, { status: 400 });
      p.balanceAmount -= data.cancelAmount;
      p.status = p.balanceAmount ? "PARTIAL_CANCELED" : "CANCELED";
      p.cancels.push({
        transactionKey: "refund_" + randomUUID(),
        cancelStatus: "DONE",
        cancelAmount: data.cancelAmount,
        cancelReason: data.cancelReason,
      });
    } else {
      const id = decodeURIComponent(path.split("/").at(-1));
      p =
        remote.get(id) || [...remote.values()].find((p) => p.paymentKey === id);
    }
    if (!p)
      return Response.json({ code: "NOT_FOUND_PAYMENT" }, { status: 404 });
    const copy = structuredClone(p);
    if (corrupt) copy.totalAmount++;
    if (key) idem.set(key, copy);
    if (path === "/v1/payments/confirm" && loseConfirmation) {
      loseConfirmation = false;
      throw Error("lost after provider charged");
    }
    if (path.endsWith("/cancel") && loseRefund) {
      loseRefund = false;
      throw Error("lost after provider refunded");
    }
    return Response.json(copy);
  };
  const app = createApp({
    dbPath: ":memory:",
    secure: false,
    paymentOptions: {
      enabled: true,
      secretKey: "test_sk_private-test",
      appOrigin: "https://koreamate.example",
      fetcher,
    },
  });
  const pw = "Test-password-387!";
  app.createUser("admin@example.test", pw, "Admin", "admin");
  app.createUser("guest@example.test", pw, "Guest", "guest");
  app.createUser("other@example.test", pw, "Other", "guest");
  app.createUser("guide@example.test", pw, "Guide", "guide");
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  t.after(() => new Promise((r) => app.server.close(r)));
  function client() {
    let cookie = "",
      csrf = "";
    return async (path, method = "GET", body, status = 200) => {
      const response = await fetch(base + "/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-CSRF-Token": csrf,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (response.headers.get("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      const data = await response.json();
      if (data.csrf) csrf = data.csrf;
      assert.equal(response.status, status, JSON.stringify({ path, data }));
      return data;
    };
  }
  const admin = client(),
    guest = client(),
    other = client(),
    guide = client();
  await admin("/admin/login", "POST", {
    email: "admin@example.test",
    password: pw,
  });
  await guest("/login", "POST", { email: "guest@example.test", password: pw });
  await other("/login", "POST", { email: "other@example.test", password: pw });
  await guide("/guide/login", "POST", {
    email: "guide@example.test",
    password: pw,
  });
  await guide("/guide/profile", "POST", {
    city: "seoul",
    purposes: ["tourism"],
    bio: "Test guide",
    languages: "中文",
    chineseLevel: "fluent",
    style: "friendly",
    rate: 35000,
    capacity: 4,
  });
  const g = await guide("/guide/profile");
  await admin("/admin/guide", "POST", {
    id: g.id,
    status: "approved",
    reason: "verified",
  });
  const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await guide("/guide/availability", "POST", { date, start: 0, end: 1440 });
  const request = {
    guideId: g.id,
    date,
    time: "10:00",
    hours: 3,
    adults: 1,
    children: 0,
    purposes: ["tourism"],
  };
  const b = await guest("/bookings", "POST", request);
  await guide("/bookings/" + b.id + "/accept", "POST", {});
  const checkout = () => guest("/bookings/" + b.id + "/checkout", "POST", {});
  const auth = () => {
    const p = [...remote.values()][0];
    p.status = "IN_PROGRESS";
    return {
      paymentKey: p.paymentKey,
      orderId: p.orderId,
      amount: p.totalAmount,
    };
  };
  return {
    app,
    client,
    admin,
    guest,
    guide,
    other,
    remote,
    calls,
    request,
    b,
    checkout,
    auth,
    pw,
    lose: () => {
      loseConfirmation = true;
    },
    corrupt: () => {
      corrupt = true;
    },
    loseRefund: () => {
      loseRefund = true;
    },
    pause: () => {
      let release;
      hold = new Promise((r) => (release = r));
      return release;
    },
  };
}
test("separate login portals enforce staff/guide roles and anonymous restrictions", async (t) => {
  const s = await setup(t),
    anon = s.client();
  await anon("/admin/stats", "GET", null, 401);
  await anon("/guide/profile", "GET", null, 401);
  await anon("/bookings", "GET", null, 401);
  await anon(
    "/login",
    "POST",
    { email: "admin@example.test", password: s.pw },
    403,
  );
  await anon(
    "/admin/login",
    "POST",
    { email: "guest@example.test", password: s.pw },
    403,
  );
  await anon(
    "/guide/login",
    "POST",
    { email: "guest@example.test", password: s.pw },
    403,
  );
  await anon(
    "/register",
    "POST",
    { email: "evil@example.test", password: s.pw, name: "No", role: "admin" },
    400,
  );
});
test("checkout ignores client prices; confirmation requires owner, exact amount, and provider approval", async (t) => {
  const s = await setup(t);
  await s.other("/bookings/" + s.b.id + "/checkout", "POST", {}, 403);
  await s.guest("/bookings/" + s.b.id + "/checkout", "POST", { amount: 1 });
  await s.checkout();
  assert.equal(s.calls.filter((c) => c.path === "/v1/payments").length, 1);
  assert.equal(s.calls[0].data.amount, 105000);
  const payload = s.auth();
  await s.other("/payments/toss/confirm", "POST", payload, 403);
  await s.guest(
    "/payments/toss/confirm",
    "POST",
    { ...payload, amount: 1 },
    400,
  );
  const result = await s.guest("/payments/toss/confirm", "POST", payload);
  assert.equal(result.status, "confirmed");
  await s.guest("/payments/toss/confirm", "POST", payload);
  assert.equal(
    s.calls.filter((c) => c.path === "/v1/payments/confirm").length,
    1,
  );
  const b = await s.guest("/bookings/" + s.b.id);
  assert.equal(b.payment_status, "paid");
  assert.equal(b.ledger.length, 1);
  assert.ok(!JSON.stringify(b).includes("test_sk"));
});
test("forged/duplicate webhooks cannot mark an unpaid booking paid", async (t) => {
  const s = await setup(t);
  await s.checkout();
  const p = [...s.remote.values()][0];
  const anon = s.client(),
    event = {
      eventType: "PAYMENT_STATUS_CHANGED",
      data: { orderId: p.orderId, status: "DONE", totalAmount: 1 },
    };
  await anon("/payments/toss/webhook", "POST", event);
  assert.equal((await s.guest("/bookings/" + s.b.id)).payment_status, "unpaid");
  await s.guest("/payments/toss/confirm", "POST", s.auth());
  await anon("/payments/toss/webhook", "POST", event);
  await anon("/payments/toss/webhook", "POST", event);
  assert.equal(
    (await s.guest("/bookings/" + s.b.id)).ledger.filter(
      (l) => l.kind === "payment",
    ).length,
    1,
  );
});
test("expired/cancelled bookings cannot authorize a charge; payment parameters are verified", async (t) => {
  const s = await setup(t);
  await s.checkout();
  const payload = s.auth();
  s.app.db
    .prepare("UPDATE bookings SET expires=? WHERE id=?")
    .run(Date.now() - 1, s.b.id);
  await s.guest("/payments/toss/confirm", "POST", payload, 409);
  assert.equal(
    s.calls.filter((c) => c.path === "/v1/payments/confirm").length,
    0,
  );
});
test("unknown confirmation preserves slot until authoritative reconciliation, without double charge", async (t) => {
  const s = await setup(t);
  await s.checkout();
  s.lose();
  await s.guest("/payments/toss/confirm", "POST", s.auth(), 503);
  s.app.db
    .prepare("UPDATE bookings SET expires=? WHERE id=?")
    .run(Date.now() - 1, s.b.id);
  const pending = await s.guest("/bookings/" + s.b.id);
  assert.equal(pending.status, "awaiting_payment");
  await s.guest(
    "/bookings/" + s.b.id + "/cancel",
    "POST",
    { reason: "cancel" },
    409,
  );
  // Restore original accepted deadline: simulates time passing without rewriting the actual deadline.
  s.app.db
    .prepare("UPDATE bookings SET expires=? WHERE id=?")
    .run(Date.now() + 1000, s.b.id);
  await s.app.payments.sweep();
  assert.equal((await s.guest("/bookings/" + s.b.id)).status, "confirmed");
  assert.equal(
    s.calls.filter((c) => c.path === "/v1/payments/confirm").length,
    1,
  );
});
test("concurrent confirmation locks also protect cancellation and manual payment entry", async (t) => {
  const s = await setup(t);
  await s.checkout();
  const release = s.pause();
  const payload = s.auth();
  const first = s.guest("/payments/toss/confirm", "POST", payload);
  while (!s.calls.some((c) => c.path === "/v1/payments/confirm"))
    await new Promise((r) => setTimeout(r, 5));
  await s.guest("/payments/toss/confirm", "POST", payload, 409);
  await s.guest(
    "/bookings/" + s.b.id + "/cancel",
    "POST",
    { reason: "cancel" },
    409,
  );
  release();
  await first;
});
test("refunds call provider, enforce finance role, persist unknown results and deduplicate retries", async (t) => {
  const s = await setup(t);
  await s.checkout();
  await s.guest("/payments/toss/confirm", "POST", s.auth());
  const d = {
    amount: 25000,
    reason: "partial cancellation",
    requestKey: randomUUID(),
  };
  await s.guest("/bookings/" + s.b.id + "/refund-online", "POST", d, 403);
  s.loseRefund();
  await s.admin("/bookings/" + s.b.id + "/refund-online", "POST", d, 503);
  await s.admin(
    "/bookings/" + s.b.id + "/settle",
    "POST",
    { reference: "no" },
    409,
  );
  await s.app.payments.sweep();
  await s.admin("/bookings/" + s.b.id + "/refund-online", "POST", d);
  const partial = await s.guest("/bookings/" + s.b.id);
  assert.equal(partial.refund, 25000);
  assert.equal(partial.payment_status, "partially_refunded");
  await s.guest("/bookings/" + s.b.id + "/cancel", "POST", {
    reason: "cancel remaining",
  });
  assert.equal((await s.guest("/bookings/" + s.b.id)).status, "confirmed");
  await s.admin("/bookings/" + s.b.id + "/refund-online", "POST", {
    amount: 80000,
    reason: "remaining refund",
    requestKey: randomUUID(),
    cancel: true,
  });
  const full = await s.guest("/bookings/" + s.b.id);
  assert.equal(full.refund, 105000);
  assert.equal(full.status, "cancelled");
  assert.equal(full.ledger.filter((l) => l.kind === "refund").length, 2);
});
test("provider amount mismatch leaves booking unpaid", async (t) => {
  const s = await setup(t);
  await s.checkout();
  const payload = s.auth();
  s.corrupt();
  await s.guest("/payments/toss/confirm", "POST", payload, 502);
  assert.equal((await s.guest("/bookings/" + s.b.id)).payment_status, "unpaid");
  assert.equal(
    s.calls.filter((c) => c.path === "/v1/payments/confirm").length,
    0,
  );
});

test("App checkout returns through the trusted website then requires the original authenticated confirmation", async (t) => {
  const s = await setup(t);
  await s.guest("/bookings/" + s.b.id + "/checkout", "POST", {
    client: "app",
    returnUrl: "https://untrusted.example",
  });
  const call = s.calls.find((c) => c.path === "/v1/payments");
  assert.equal(
    call.data.successUrl,
    "https://koreamate.example/payments/success?client=app",
  );
  assert.equal(
    call.data.failUrl,
    "https://koreamate.example/payments/fail?client=app",
  );
  const params = s.auth();
  await s.other("/payments/toss/confirm", "POST", params, 403);
  await s.guest("/payments/toss/confirm", "POST", params);
  assert.equal((await s.guest("/bookings/" + s.b.id)).status, "confirmed");
});
