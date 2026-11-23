// 《客户预订与服务方案》 turned into assertions.
//
// The first test checks the engine against the worked example in the document itself,
// so if someone later retunes a percentage the table in the document still has to hold.
// The rest run against a live server, because a price is only correct if the server
// charges it — the browser's copy of the arithmetic is not the authority.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import {
  LEVELS,
  PRICING_DEFAULTS,
  cancellationTerms,
  minimumMinutes,
  quote,
} from "../src/pricing.js";

// A Monday at 10:00 Seoul time: no night, weekend or holiday loading in the way.
const MONDAY_10 = (() => {
  let ms = Date.parse("2026-12-07T10:00:00+09:00");
  while (new Date(ms + 32400000).getUTCDay() !== 1) ms += 86400000;
  return ms;
})();

test("the document's own worked example, line for line", () => {
  // 「假设某L3中级译员标准时薪为100元/小时」, two hours.
  const base = { rate: 100, level: "L3", minutes: 120, purposes: ["errands"] };
  const early = MONDAY_10 - 10 * 3600000; // 提前3小时以上
  const late = MONDAY_10 - 1 * 3600000; // 3小时内紧急下单

  assert.equal(quote({ ...base, startMs: MONDAY_10, nowMs: early }).total, 200);
  assert.equal(quote({ ...base, startMs: MONDAY_10, nowMs: late }).total, 240);
  assert.equal(
    quote({ ...base, mode: "online", startMs: MONDAY_10, nowMs: early }).total,
    100,
  );
  assert.equal(
    quote({ ...base, mode: "online", startMs: MONDAY_10, nowMs: late }).total,
    120,
  );
});

test("minimum billable duration, time-of-day and scene loading", () => {
  const far = MONDAY_10 - 10 * 3600000;
  const at = (hhmm) =>
    quote({
      rate: 100,
      level: "L3",
      minutes: 120,
      purposes: ["errands"],
      startMs: Date.parse(`2026-12-07T${hhmm}:00+09:00`),
      nowMs: Date.parse("2026-12-01T09:00:00+09:00"),
    });

  // 「线下陪同：每单最低按2小时计费」 — a one-hour on-site booking bills two.
  const short = quote({
    rate: 100,
    minutes: 60,
    purposes: [],
    startMs: MONDAY_10,
    nowMs: far,
  });
  assert.equal(short.billedMinutes, 120);
  assert.equal(short.minimumApplied, true);
  assert.equal(short.total, 200);

  // 「线上语音：每单最低按10分钟计费」.
  assert.equal(minimumMinutes("online", PRICING_DEFAULTS), 10);
  const call = quote({
    rate: 100,
    mode: "online",
    minutes: 4,
    purposes: [],
    startMs: MONDAY_10,
    nowMs: far,
  });
  assert.equal(call.billedMinutes, 10);
  // 10 minutes of a ¥100/h rate at the 50% online rate.
  assert.equal(call.total, Math.round((100 * 10 * 50) / 6000));

  // 「22:00以后开始的服务：加收20%」 — decided by the start time.
  const night = at("22:30");
  assert.ok(night.lines.some((l) => l.key === "night" && l.percent === 20));
  assert.equal(
    at("21:30").lines.some((l) => l.key === "night"),
    false,
  );

  // 「周末及法定节假日：加收15%」.
  const sunday = quote({
    rate: 100,
    minutes: 120,
    purposes: [],
    startMs: Date.parse("2026-12-06T10:00:00+09:00"), // a Sunday
    nowMs: Date.parse("2026-12-01T09:00:00+09:00"),
  });
  assert.ok(sunday.lines.some((l) => l.key === "weekend" && l.percent === 15));

  // A date the admin has listed as a public holiday behaves like a weekend.
  const holiday = quote({
    rate: 100,
    minutes: 120,
    purposes: [],
    startMs: MONDAY_10,
    nowMs: far,
    settings: {
      holidays: [new Date(MONDAY_10 + 32400000).toISOString().slice(0, 10)],
    },
  });
  assert.ok(
    holiday.lines.some((l) => l.key === "weekend" && l.holiday === true),
  );

  // 「涉及医疗…根据译员等级和场景复杂度加收20%–50%」, never above 50%, and the
  // heaviest selected scene decides it rather than the sum.
  const medical = quote({
    rate: 100,
    level: "L5",
    minutes: 120,
    purposes: ["shopping", "medical"],
    startMs: MONDAY_10,
    nowMs: far,
  });
  const scene = medical.lines.find((l) => l.key === "scene");
  assert.equal(scene.percent, 50); // medical 30 + L5 20, at the cap
  assert.ok(
    quote({
      rate: 100,
      minutes: 120,
      purposes: ["shopping"],
      startMs: MONDAY_10,
      nowMs: far,
    }).lines.every((l) => l.key !== "scene"),
  );
});

test("cancellation bands match 六、取消与改期规则", () => {
  const start = MONDAY_10;
  const at = (hoursAhead, urgent = false) =>
    cancellationTerms({
      startMs: start,
      nowMs: start - hoursAhead * 3600000,
      urgent,
    });

  assert.equal(at(48).refundPercent, 100); // 提前24小时以上：全额退款
  assert.equal(at(12).refundPercent, 80); // 提前3–24小时：退80%
  assert.equal(at(12).feePercent, 20);
  assert.equal(at(1).refundPercent, 50); // 提前3小时以内：退50%
  assert.equal(at(1).feePercent, 50);
  // 紧急单取消：不退预付款，但可改期一次
  assert.equal(at(48, true).refundPercent, 0);
  assert.equal(at(48, true).reschedules, 1);
});

// ---------------------------------------------------------------------------
// Against a running server.
// ---------------------------------------------------------------------------
let app, base, dir, admin, guide, guest, gid;
const password = "Pricing-test-713!";
function client() {
  let cookie = "",
    csrf = "";
  return async (path, method = "GET", data, expected = 200) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        "X-CSRF-Token": csrf,
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    const result = await r.json();
    assert.equal(r.status, expected, JSON.stringify({ path, result }));
    if (result.csrf) csrf = result.csrf;
    return result;
  };
}
// A weekday far enough out that nothing is urgent and nothing is loaded.
const date = (() => {
  let ms = Date.now() + 6 * 86400000;
  while ([0, 6].includes(new Date(ms + 32400000).getUTCDay())) ms += 86400000;
  return new Date(ms + 32400000).toISOString().slice(0, 10);
})();

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "km-pricing-"));
  app = createApp({
    dbPath: join(dir, "db.sqlite"),
    secure: false,
    manualPayments: true,
  });
  app.createUser("admin@pricing.test", password, "Admin", "admin");
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + app.server.address().port;
  admin = client();
  guide = client();
  guest = client();
  await admin("/admin/login", "POST", {
    email: "admin@pricing.test",
    password,
  });
  await guide("/register", "POST", {
    email: "guide@pricing.test",
    password,
    name: "等级译员",
    role: "guide",
  });
  await guest("/register", "POST", {
    email: "guest@pricing.test",
    password,
    name: "客户",
    role: "guest",
  });
  await guide("/guide/profile", "POST", {
    city: "seoul",
    purposes: ["shopping", "medical"],
    bio: "现场翻译，购物与就医场景。",
    languages: "中文 · 한국어",
    chineseLevel: "native",
    style: "professional",
    rate: 999,
    capacity: 4,
    image: "",
    pledge: true,
    offersOnline: true,
  });
  gid = (await guide("/guide/profile")).id;
});
after(async () => {
  await new Promise((r) => app.server.close(r));
  rmSync(dir, { recursive: true, force: true });
});

test("no price reaches a customer without a reviewer setting it", async () => {
  // An interpreter's own figure is a request, never the charged rate.
  assert.equal((await guide("/guide/profile")).askingRate, 999);
  assert.equal((await guide("/guide/profile")).rate, 0);

  // Approving without a level is refused: the level is what sets the published rate.
  await admin(
    "/admin/guide",
    "POST",
    { id: gid, status: "approved", reason: "looks fine" },
    400,
  );
  assert.equal((await guide("/guide/profile")).status, "pending");

  // With a level and no explicit rate, the level's published rate is adopted.
  await admin("/admin/guide", "POST", {
    id: gid,
    status: "approved",
    reason: "identity checked",
    level: "L3",
  });
  const g = await guide("/guide/profile");
  assert.equal(g.level, "L3");
  assert.equal(g.rate, LEVELS.L3.rate);
  assert.equal(g.askingRate, 999);
});

test("the directory lists approved interpreters only, with the card's fields", async () => {
  await guide("/guide/availability", "POST", { date, start: 0, end: 1440 });
  const dir1 = await guest("/interpreters");
  assert.equal(dir1.total, 1);
  const card = dir1.interpreters[0];
  // Everything the directory card renders has to actually arrive.
  for (const key of [
    "name",
    "level",
    "levelName",
    "rating",
    "serviceCount",
    "bio",
    "purposes",
    "rate",
    "city",
    "offersOnline",
  ])
    assert.ok(key in card, `missing ${key}`);
  assert.equal(card.rate, LEVELS.L3.rate);
  assert.equal(card.serviceCount, 0);

  // Filters narrow it; an unapproved interpreter is never in it.
  assert.equal((await guest("/interpreters?city=busan")).total, 0);
  assert.equal((await guest("/interpreters?level=L5")).total, 0);
  assert.equal((await guest("/interpreters?purposes=concert")).total, 0);

  const other = client();
  await other("/register", "POST", {
    email: "pending@pricing.test",
    password,
    name: "待审译员",
    role: "guide",
  });
  await other("/guide/profile", "POST", {
    city: "seoul",
    purposes: ["shopping"],
    bio: "尚未通过审核的资料。",
    languages: "中文",
    chineseLevel: "fluent",
    style: "quiet",
    rate: 200,
    capacity: 2,
    image: "",
    pledge: true,
  });
  assert.equal((await guest("/interpreters")).total, 1);
});

test("the server charges the document's rules, not the client's number", async () => {
  const book = (over = {}) => ({
    guideId: gid,
    date,
    time: "10:00",
    minutes: 120,
    adults: 1,
    children: 0,
    purposes: ["shopping"],
    ...over,
  });
  const L3 = LEVELS.L3.rate;

  // A tampered total is refused rather than honoured.
  await guest("/bookings", "POST", book({ expectedTotal: 1 }), 409);

  const b1 = await guest("/bookings", "POST", book({ expectedTotal: L3 * 2 }));
  const order = await guest("/bookings/" + b1.id);
  assert.equal(order.total, L3 * 2);
  assert.equal(order.mode, "onsite");
  assert.equal(order.minutes, 120);
  assert.equal(order.urgent, false);
  // The breakdown is frozen on the order so the customer keeps what they agreed to.
  assert.equal(order.breakdown.base, L3 * 2);
  assert.deepEqual(order.breakdown.lines, []);
  // And the order carries what cancelling right now would return.
  assert.equal(order.cancellation.refundPercent, 100);

  // A medical booking carries the professional-scene loading.
  const med = await guest(
    "/bookings",
    "POST",
    book({ time: "13:00", purposes: ["medical"] }),
  );
  const medOrder = await guest("/bookings/" + med.id);
  assert.equal(medOrder.total, Math.round(L3 * 2 * 1.3));
  assert.ok(medOrder.breakdown.lines.some((l) => l.key === "scene"));

  // An online call is priced off the reduced base and keeps its own minimum.
  const call = await guest(
    "/bookings",
    "POST",
    book({ time: "16:00", mode: "online", minutes: 10 }),
  );
  const callOrder = await guest("/bookings/" + call.id);
  assert.equal(callOrder.mode, "online");
  assert.equal(callOrder.total, Math.round((L3 * 10 * 50) / 6000));
});

test("a booking inside the lead time is urgent and is surcharged", async () => {
  // Two hours from now is inside 「预约时间须至少提前3小时」.
  const soon = new Date(Date.now() + 2 * 3600000 + 32400000);
  const soonDate = soon.toISOString().slice(0, 10);
  const soonTime = soon.toISOString().slice(11, 16);
  await guide("/guide/availability", "POST", {
    date: soonDate,
    start: 0,
    end: 1440,
  });

  const r = await guest("/bookings", "POST", {
    guideId: gid,
    date: soonDate,
    time: soonTime,
    minutes: 120,
    adults: 1,
    children: 0,
    purposes: ["shopping"],
  });
  const order = await guest("/bookings/" + r.id);
  assert.equal(order.urgent, true);
  assert.ok(
    order.breakdown.lines.some((l) => l.key === "urgent" && l.percent === 20),
  );
  // 紧急单取消：不退预付款.
  assert.equal(order.cancellation.refundPercent, 0);
});
