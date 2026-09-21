import http from "node:http";
import { createPayments } from "./payments.mjs";
import { createChat } from "./chat.mjs";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { mkdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const purposes = ["tourism", "business", "medical", "concert"];
const cities = ["seoul", "busan", "incheon", "jeju"];
const now = () => Date.now(),
  id = () => randomUUID();
const hash = (t) => createHash("sha256").update(t).digest("hex");
const clean = (v, max = 2000) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const fail = (msg, status = 400) => {
  throw Object.assign(new Error(msg), { status });
};
const integer = (v, min, max) => {
  let n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max)
    fail(`请输入 ${min} 至 ${max} 的整数`);
  return n;
};
function password(p) {
  if (typeof p !== "string" || p.length < 10 || p.length > 128)
    fail("密码需为10至128个字符");
  let salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(p, salt, 64).toString("hex");
}
function verify(p, h) {
  try {
    let [salt, key] = h.split(":");
    return timingSafeEqual(scryptSync(p, salt, 64), Buffer.from(key, "hex"));
  } catch {
    return false;
  }
}
const safeUser = (u) =>
  u ? { id: u.id, name: u.name, email: u.email, role: u.role } : null;
const jsonList = (s) => JSON.parse(s || "[]");
export function createApp({
  dbPath = process.env.DATABASE_PATH || resolve(ROOT, "data/platform.sqlite"),
  secure = process.env.NODE_ENV === "production",
  manualPayments = process.env.MANUAL_PAYMENTS === "true",
  paymentOptions = {},
} = {}) {
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),csrf TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS guides(id TEXT PRIMARY KEY,user_id TEXT UNIQUE REFERENCES users(id),city TEXT,purposes TEXT,bio TEXT,languages TEXT,chinese_level TEXT,style TEXT,rate INTEGER,capacity INTEGER,image TEXT,status TEXT DEFAULT 'pending',paused INTEGER DEFAULT 0,review_note TEXT DEFAULT '',is_demo INTEGER DEFAULT 0,created INTEGER);
 CREATE TABLE IF NOT EXISTS availability(id TEXT PRIMARY KEY,guide_id TEXT REFERENCES guides(id),weekday INTEGER,date TEXT,start INTEGER,end INTEGER,blocked INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY,guest_id TEXT REFERENCES users(id),guide_id TEXT REFERENCES guides(id),start INTEGER,end INTEGER,adults INTEGER,children INTEGER,purposes TEXT,city TEXT,note TEXT,meeting TEXT DEFAULT '',status TEXT,payment_status TEXT DEFAULT 'unpaid',settlement_status TEXT DEFAULT 'not_eligible',total INTEGER,commission INTEGER,refund INTEGER DEFAULT 0,expires INTEGER,created INTEGER,updated INTEGER);
 CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,booking_id TEXT REFERENCES bookings(id),user_id TEXT REFERENCES users(id),body TEXT,created INTEGER);
 CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),body TEXT,booking_id TEXT,is_read INTEGER DEFAULT 0,created INTEGER);
 CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,booking_id TEXT UNIQUE REFERENCES bookings(id),guest_id TEXT REFERENCES users(id),guide_id TEXT REFERENCES guides(id),rating INTEGER,body TEXT,visible INTEGER DEFAULT 1,moderation_note TEXT DEFAULT '',created INTEGER);
 CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY,booking_id TEXT REFERENCES bookings(id),user_id TEXT REFERENCES users(id),kind TEXT,body TEXT,evidence TEXT,status TEXT DEFAULT 'open',resolution TEXT DEFAULT '',created INTEGER);
 CREATE TABLE IF NOT EXISTS changes(id TEXT PRIMARY KEY,booking_id TEXT REFERENCES bookings(id),start INTEGER,end INTEGER,meeting TEXT,reason TEXT,guest_ok INTEGER DEFAULT 0,guide_ok INTEGER DEFAULT 0,status TEXT DEFAULT 'pending',created INTEGER);
 CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,booking_id TEXT REFERENCES bookings(id),kind TEXT,amount INTEGER,reference TEXT UNIQUE,actor TEXT REFERENCES users(id),created INTEGER);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT,action TEXT,target TEXT,detail TEXT,created INTEGER);
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,kind TEXT,purposes TEXT,created INTEGER);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY,count INTEGER,until INTEGER);
 `);
  const q = (sql, ...args) => db.prepare(sql).all(...args),
    one = (sql, ...args) => db.prepare(sql).get(...args),
    run = (sql, ...args) => db.prepare(sql).run(...args);
  const defaults = {
    commission: 20,
    responseHours: 24,
    paymentMinutes: 30,
    bufferMinutes: 30,
    settlementHours: 24,
    heroTitle: "与当地人一起，走进韩国",
    heroSubtitle: "按你的时间和目的，寻找合适的韩国地陪。",
    support: "平台客服",
    rules:
      "预约需由地陪确认后付款。服务内容、集合地点及额外支出请在订单消息中确认。取消或退款申请由平台按订单约定处理。",
    faq: "所有预约时间均为韩国时间。平台审核通过的地陪才能接受预约。医疗类别仅用于匹配已核准的陪同服务范围，不提供诊断或治疗。",
    paymentInstructions: "",
  };
  for (const [k, v] of Object.entries(defaults))
    run("INSERT OR IGNORE INTO settings VALUES(?,?)", k, JSON.stringify(v));
  const settings = () =>
    Object.fromEntries(
      q("SELECT * FROM settings").map((x) => [x.key, JSON.parse(x.value)]),
    );
  const log = (u, action, target, detail = "") =>
    run(
      "INSERT INTO audit VALUES(?,?,?,?,?,?)",
      id(),
      u?.id || "system",
      action,
      target,
      clean(detail),
      now(),
    );
  const notify = (user, body, bid = null) =>
    run(
      "INSERT INTO notifications VALUES(?,?,?,?,0,?)",
      id(),
      user,
      body,
      bid,
      now(),
    );
  const admins = (body, bid = null) =>
    q(
      "SELECT id FROM users WHERE role IN ('admin','support','finance','reviewer')",
    ).forEach((u) => notify(u.id, body, bid));
  const transaction = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      db.exec("COMMIT");
      return r;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const guideFor = (u) => one("SELECT * FROM guides WHERE user_id=?", u.id);
  const expire = () => {
    for (const b of q(
      "SELECT * FROM bookings WHERE status IN ('requested','awaiting_payment') AND expires<=?",
      now(),
    )) {
      if (payments.busy(b.id)) continue;
      run(
        "UPDATE bookings SET status='expired',updated=? WHERE id=?",
        now(),
        b.id,
      );
      let g = one("SELECT user_id FROM guides WHERE id=?", b.guide_id);
      notify(b.guest_id, "预约已超时关闭，档期已释放", b.id);
      notify(g.user_id, "预约已超时关闭", b.id);
      log(null, "booking.expired", b.id);
    }
    run("DELETE FROM sessions WHERE expires<?", now());
  };
  const timeInput = (date, time, hours) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
      fail("请选择日期和开始时间");
    const start = Date.parse(`${date}T${time}:00+09:00`);
    if (
      !Number.isFinite(start) ||
      new Date(start + 32400000).toISOString().slice(0, 16) !==
        `${date}T${time}`
    )
      fail("日期或时间无效");
    const duration = integer(hours, 1, 12);
    if (start < now() + 300000) fail("请预约至少5分钟后的时间");
    let end = start + duration * 3600000;
    if (
      new Date(start + 32400000).toISOString().slice(0, 10) !==
      new Date(end - 1 + 32400000).toISOString().slice(0, 10)
    )
      fail("单次服务不能跨越午夜");
    return { start, end };
  };
  const fits = (g, start, end, exclude = null) => {
    const local = new Date(start + 32400000),
      date = local.toISOString().slice(0, 10),
      weekday = local.getUTCDay(),
      a = local.getUTCHours() * 60 + local.getUTCMinutes(),
      b = a + (end - start) / 60000;
    const rows = q(
      "SELECT * FROM availability WHERE guide_id=? AND (date=? OR (date IS NULL AND weekday=?))",
      g.id,
      date,
      weekday,
    );
    if (rows.some((x) => x.blocked && a < x.end && b > x.start)) return false;
    const custom = rows.filter((x) => x.date === date && !x.blocked),
      open = custom.length
        ? custom
        : rows.filter((x) => x.date === null && !x.blocked);
    if (!open.some((x) => x.start <= a && x.end >= b)) return false;
    const buffer = settings().bufferMinutes * 60000;
    return !one(
      "SELECT id FROM bookings WHERE guide_id=? AND id!=? AND status IN ('awaiting_payment','confirmed','in_service','completion_pending','completed') AND start<? AND end>?",
      g.id,
      exclude || "",
      end + buffer,
      start - buffer,
    );
  };
  const publicGuide = (g) => {
    let r = one(
      "SELECT AVG(rating) rating,COUNT(*) count FROM reviews WHERE guide_id=? AND visible=1",
      g.id,
    );
    return {
      id: g.id,
      name: one("SELECT name FROM users WHERE id=?", g.user_id)?.name,
      city: g.city,
      purposes: jsonList(g.purposes),
      bio: g.bio,
      languages: g.languages,
      chineseLevel: g.chinese_level,
      style: g.style,
      rate: g.rate,
      capacity: g.capacity,
      image: g.image,
      isDemo: !!g.is_demo,
      rating: r.rating,
      reviewCount: r.count,
    };
  };
  const auth = (req) => {
    let token = (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("km_session="))
      ?.slice(11);
    return token
      ? one(
          "SELECT u.*,s.csrf FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
          hash(token),
          now(),
        )
      : null;
  };
  const need = (u) => {
    if (!u) fail("请先登录", 401);
  };
  const role = (u, ...roles) => {
    need(u);
    if (!roles.includes(u.role)) fail("无此操作权限", 403);
  };
  const staff = (u) =>
    u && ["admin", "support", "finance", "reviewer"].includes(u.role);
  const booking = (bid, u) => {
    need(u);
    let b = one(
      "SELECT b.*,g.user_id guide_user FROM bookings b JOIN guides g ON b.guide_id=g.id WHERE b.id=?",
      bid,
    );
    if (!b) fail("订单不存在", 404);
    if (
      !["admin", "support", "finance"].includes(u.role) &&
      u.id !== b.guest_id &&
      u.id !== b.guide_user
    )
      fail("无权访问该订单", 403);
    return b;
  };
  const participants = (b, text) => {
    notify(b.guest_id, text, b.id);
    notify(b.guide_user, text, b.id);
  };
  const payments = createPayments({
    db,
    q,
    one,
    run,
    transaction,
    log,
    admins,
    participants,
    ...paymentOptions,
  });
  const chat = createChat({ db, q, one, run, transaction, notify, log });
  const serialize = (b) => ({
    conversationId: chat.byBooking(b.id),
    onlinePayment: payments.summary(b.id),
    ...b,
    purposes: jsonList(b.purposes),
    guideName: one(
      "SELECT u.name FROM users u JOIN guides g ON u.id=g.user_id WHERE g.id=?",
      b.guide_id,
    )?.name,
    guestName: one("SELECT name FROM users WHERE id=?", b.guest_id)?.name,
  });
  function createUser(email, pw, name, roleName = "guest") {
    email = clean(email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("邮箱格式不正确");
    if (!clean(name, 60)) fail("请填写姓名");
    const uid = id();
    try {
      run(
        "INSERT INTO users VALUES(?,?,?,?,?,?)",
        uid,
        email,
        password(pw),
        clean(name, 60),
        roleName,
        now(),
      );
    } catch (e) {
      if (e.message.includes("UNIQUE")) fail("邮箱已注册");
      throw e;
    }
    return one("SELECT * FROM users WHERE id=?", uid);
  }
  const cookie = (res, u) => {
    let token = randomBytes(32).toString("hex"),
      csrf = randomBytes(24).toString("hex");
    run(
      "INSERT INTO sessions VALUES(?,?,?,?)",
      hash(token),
      u.id,
      csrf,
      now() + 7 * 86400000,
    );
    res.setHeader(
      "Set-Cookie",
      `km_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure ? "; Secure" : ""}`,
    );
    return { user: safeUser(u), csrf };
  };
  async function api(req, res, url) {
    expire();
    const path = url.pathname,
      method = req.method,
      u = auth(req),
      get = (k) => url.searchParams.get(k);
    let data = {};
    if (!["GET", "HEAD"].includes(method)) {
      if (!String(req.headers["content-type"]).startsWith("application/json"))
        fail("仅接受JSON请求", 415);
      let chunks = [],
        size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > 64000) fail("提交内容过大", 413);
        chunks.push(c);
      }
      try {
        data = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      } catch {
        fail("请求格式错误");
      }
      if (!data || typeof data !== "object" || Array.isArray(data))
        fail("请求必须是JSON对象", 400);
      const origin = req.headers.origin;
      if (
        origin &&
        origin !== `${secure ? "https" : "http"}://${req.headers.host}` &&
        origin !== process.env.APP_ORIGIN
      )
        fail("请求来源不受信任", 403);
      if (
        path !== "/api/payments/toss/webhook" &&
        u &&
        req.headers["x-csrf-token"] !== u.csrf
      )
        fail("会话校验失败，请刷新页面", 403);
    }
    if (path === "/api/payments/toss/webhook" && method === "POST")
      return payments.webhook(data);
    if (path === "/api/payments/toss/confirm" && method === "POST") {
      need(u);
      const bid = payments.lookup(clean(data.orderId, 64));
      if (!bid) fail("支付订单不存在", 404);
      const b = booking(bid, u);
      if (u.id !== b.guest_id) fail("仅付款游客可确认支付", 403);
      return payments.confirm(bid, data);
    }
    if (path === "/api/health" && method === "GET")
      return { ok: one("SELECT 1 ok").ok === 1 };
    if (path === "/api/session" && method === "GET")
      return {
        user: safeUser(u),
        csrf: u?.csrf,
        manualPayments,
        payments: payments.config,
        settings: settings(),
      };
    if (path === "/api/register" && method === "POST") {
      if (!["guest", "guide"].includes(data.role)) fail("请选择账户类型");
      const user = createUser(data.email, data.password, data.name, data.role);
      log(user, "account.registered", user.id);
      return cookie(res, user);
    }
    if (
      ["/api/login", "/api/guide/login", "/api/admin/login"].includes(path) &&
      method === "POST"
    ) {
      const email = clean(data.email, 254).toLowerCase(),
        key = hash(`${req.socket.remoteAddress}:${email}`),
        attempt = one("SELECT * FROM login_attempts WHERE key=?", key);
      if (attempt?.until > now() && attempt.count >= 10)
        fail("尝试次数过多，请15分钟后重试", 429);
      const user = one("SELECT * FROM users WHERE email=?", email);
      if (
        !user ||
        !verify(
          typeof data.password === "string" && data.password.length <= 128
            ? data.password
            : "",
          user.password,
        )
      ) {
        run(
          "INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until<? THEN 1 ELSE count+1 END,until=?",
          key,
          now() + 900000,
          now(),
          now() + 900000,
        );
        fail("邮箱或密码不正确", 401);
      }
      const isStaff = ["admin", "support", "finance", "reviewer"].includes(
        user.role,
      );
      if (path === "/api/admin/login" ? !isStaff : isStaff)
        fail("请使用与你的账户身份对应的登录入口", 403);
      if (path === "/api/guide/login" && user.role !== "guide")
        fail("此入口仅供地陪账户登录", 403);
      run("DELETE FROM login_attempts WHERE key=?", key);
      return cookie(res, user);
    }
    if (path === "/api/logout" && method === "POST") {
      need(u);
      run("DELETE FROM sessions WHERE user_id=? AND csrf=?", u.id, u.csrf);
      res.setHeader(
        "Set-Cookie",
        "km_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      );
      return { ok: true };
    }
    if (path === "/api/guides" && method === "GET") {
      const city = get("city") || "seoul",
        ps = (get("purposes") || "tourism").split(",");
      if (!cities.includes(city) || ps.some((p) => !purposes.includes(p)))
        fail("筛选条件无效");
      const adults = integer(get("adults") || 1, 1, 12),
        children = integer(get("children") || 0, 0, 12),
        { start, end } = timeInput(
          get("date") || "",
          get("time") || "",
          get("hours") || 3,
        ),
        budget = get("budget") ? integer(get("budget"), 1, 100000000) : null;
      let rows = q(
        "SELECT * FROM guides WHERE city=? AND status='approved' AND paused=0",
        city,
      )
        .filter(
          (g) =>
            ps.every((p) => jsonList(g.purposes).includes(p)) &&
            g.capacity >= adults + children &&
            (!get("chinese") || g.chinese_level === get("chinese")) &&
            (!get("style") || g.style === get("style")) &&
            (!budget || (g.rate * (end - start)) / 3600000 <= budget) &&
            fits(g, start, end),
        )
        .map((g) => ({
          ...publicGuide(g),
          total: (g.rate * (end - start)) / 3600000,
        }));
      rows.sort((a, b) =>
        get("sort") === "price"
          ? a.total - b.total
          : (b.rating || 0) - (a.rating || 0),
      );
      run(
        "INSERT INTO events VALUES(?,?,?,?)",
        id(),
        "search",
        JSON.stringify(ps),
        now(),
      );
      return rows;
    }
    const gm = path.match(/^\/api\/guides\/([^/]+)$/);
    if (gm && method === "GET") {
      const g = one(
        "SELECT * FROM guides WHERE id=? AND status='approved' AND paused=0",
        gm[1],
      );
      if (!g) fail("地陪暂不可预约", 404);
      return {
        ...publicGuide(g),
        reviews: q(
          "SELECT r.rating,r.body,r.created,u.name FROM reviews r JOIN users u ON u.id=r.guest_id WHERE r.guide_id=? AND r.visible=1 ORDER BY r.created DESC",
          g.id,
        ),
        availability: q(
          "SELECT weekday,date,start,end,blocked FROM availability WHERE guide_id=?",
          g.id,
        ),
      };
    }
    if (path === "/api/guide/profile") {
      role(u, "guide");
      const g = guideFor(u);
      if (method === "GET")
        return g
          ? {
              ...publicGuide(g),
              status: g.status,
              paused: !!g.paused,
              reviewNote: g.review_note,
            }
          : null;
      if (method === "POST") {
        if (
          !cities.includes(data.city) ||
          !Array.isArray(data.purposes) ||
          !data.purposes.length ||
          data.purposes.some((x) => !purposes.includes(x))
        )
          fail("请选择城市及服务类别");
        if (!clean(data.bio) || !clean(data.languages))
          fail("请填写介绍和语言能力");
        if (
          !["basic", "fluent", "native"].includes(data.chineseLevel) ||
          !["friendly", "quiet", "professional"].includes(data.style)
        )
          fail("请选择中文水平及服务风格");
        let image = clean(data.image, 1000);
        if (image && !/^https:\/\//.test(image)) fail("图片须使用HTTPS地址");
        const gid = g?.id || id();
        run(
          `INSERT INTO guides(id,user_id,city,purposes,bio,languages,chinese_level,style,rate,capacity,image,status,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?) ON CONFLICT(user_id) DO UPDATE SET city=excluded.city,purposes=excluded.purposes,bio=excluded.bio,languages=excluded.languages,chinese_level=excluded.chinese_level,style=excluded.style,rate=excluded.rate,capacity=excluded.capacity,image=excluded.image,status='pending',review_note=''`,
          gid,
          u.id,
          data.city,
          JSON.stringify([...new Set(data.purposes)]),
          clean(data.bio),
          clean(data.languages, 100),
          data.chineseLevel,
          data.style,
          integer(data.rate, 10000, 1000000),
          integer(data.capacity, 1, 12),
          image,
          now(),
        );
        admins("有地陪资料等待审核");
        log(u, "guide.submitted", gid);
        return { ok: true };
      }
    }
    if (path === "/api/guide/pause" && method === "POST") {
      role(u, "guide");
      let g = guideFor(u);
      if (!g) fail("请先提交资料");
      run("UPDATE guides SET paused=? WHERE id=?", data.paused ? 1 : 0, g.id);
      log(u, "guide.pause", g.id, String(!!data.paused));
      return { ok: true };
    }
    if (path === "/api/guide/availability") {
      role(u, "guide");
      let g = guideFor(u);
      if (!g) fail("请先提交资料");
      if (method === "GET")
        return q(
          "SELECT * FROM availability WHERE guide_id=? ORDER BY date,weekday,start",
          g.id,
        );
      if (method === "POST") {
        let start = integer(data.start, 0, 1439),
          end = integer(data.end, 1, 1440);
        if (end <= start) fail("结束时间应晚于开始时间");
        let date = data.date ? clean(data.date, 10) : null,
          weekday = date ? null : integer(data.weekday, 0, 6);
        if (
          date &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(Date.parse(date)))
        )
          fail("日期格式错误");
        run(
          "INSERT INTO availability VALUES(?,?,?,?,?,?,?)",
          id(),
          g.id,
          weekday,
          date,
          start,
          end,
          data.blocked ? 1 : 0,
        );
        log(u, "availability.add", g.id);
        return { ok: true };
      }
    }
    if (path.startsWith("/api/guide/availability/") && method === "DELETE") {
      role(u, "guide");
      run(
        "DELETE FROM availability WHERE id=? AND guide_id=?",
        path.split("/").pop(),
        guideFor(u)?.id || "",
      );
      return { ok: true };
    }
    if (path === "/api/bookings" && method === "POST") {
      role(u, "guest");
      return transaction(() => {
        const g = one(
          "SELECT * FROM guides WHERE id=? AND status='approved' AND paused=0",
          data.guideId,
        );
        if (!g) fail("地陪暂不可预约");
        if (g.is_demo) fail("演示资料不接受真实预约");
        const { start, end } = timeInput(data.date, data.time, data.hours),
          adults = integer(data.adults, 1, 12),
          children = integer(data.children || 0, 0, 12);
        if (adults + children > g.capacity) fail("超过接待人数");
        if (
          !Array.isArray(data.purposes) ||
          !data.purposes.length ||
          !data.purposes.every((p) => jsonList(g.purposes).includes(p))
        )
          fail("服务目的不符合");
        if (!fits(g, start, end)) fail("该时段不可预约，请重新搜索", 409);
        if (
          one(
            "SELECT id FROM bookings WHERE guest_id=? AND guide_id=? AND start=? AND status='requested'",
            u.id,
            g.id,
            start,
          )
        )
          fail("已经提交过该预约", 409);
        const total = (g.rate * (end - start)) / 3600000;
        if (
          data.expectedTotal !== undefined &&
          Number(data.expectedTotal) !== total
        )
          fail("价格已变动，请刷新详情后重新确认", 409);
        const bid = id(),
          commission = Math.round((total * settings().commission) / 100);
        run(
          `INSERT INTO bookings(id,guest_id,guide_id,start,end,adults,children,purposes,city,note,status,total,commission,expires,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,'requested',?,?,?,?,?)`,
          bid,
          u.id,
          g.id,
          start,
          end,
          adults,
          children,
          JSON.stringify(data.purposes),
          g.city,
          clean(data.note),
          total,
          commission,
          Math.min(now() + settings().responseHours * 3600000, start),
          now(),
          now(),
        );
        notify(g.user_id, "收到新的预约申请", bid);
        log(u, "booking.request", bid);
        return { id: bid };
      });
    }
    if (path === "/api/bookings" && method === "GET") {
      need(u);
      let rows;
      if (["admin", "support", "finance"].includes(u.role))
        rows = q("SELECT * FROM bookings ORDER BY created DESC");
      else
        rows = q(
          "SELECT b.* FROM bookings b JOIN guides g ON b.guide_id=g.id WHERE b.guest_id=? OR g.user_id=? ORDER BY b.created DESC",
          u.id,
          u.id,
        );
      return rows.map(serialize);
    }
    if (path === "/api/conversations" && method === "GET") return chat.list(u);
    const cm = path.match(/^\/api\/conversations\/([^/]+)\/(messages|read)$/);
    if (cm) {
      if (cm[2] === "messages" && method === "GET")
        return chat.messages(cm[1], u, url.searchParams);
      if (cm[2] === "messages" && method === "POST")
        return chat.send(cm[1], u, data);
      if (cm[2] === "read" && method === "POST")
        return chat.read(cm[1], u, data.lastSequence);
      fail("不支持此操作", 405);
    }
    const acm = path.match(/^\/api\/admin\/conversations\/([^/]+)\/audit$/);
    if (acm && method === "POST") return chat.auditRead(acm[1], u, data);
    const bm = path.match(/^\/api\/bookings\/([^/]+)(?:\/([^/]+))?$/);
    if (bm) {
      let b = booking(bm[1], u),
        action = bm[2];
      if (!action && method === "GET")
        return {
          ...serialize(b),
          messages: [b.guest_id, b.guide_user].includes(u.id)
            ? q(
                "SELECT m.*,u.name FROM messages m JOIN users u ON m.user_id=u.id WHERE booking_id=? ORDER BY m.created LIMIT 100",
                b.id,
              )
            : [],
          cases: q(
            "SELECT * FROM cases WHERE booking_id=? ORDER BY created DESC",
            b.id,
          ),
          changes: q(
            "SELECT * FROM changes WHERE booking_id=? ORDER BY created DESC",
            b.id,
          ),
          ledger: q(
            "SELECT kind,amount,reference,created FROM ledger WHERE booking_id=? ORDER BY created",
            b.id,
          ),
          review: one("SELECT * FROM reviews WHERE booking_id=?", b.id) || null,
        };
      if (method !== "POST") fail("不支持此操作", 405);
      if (["checkout", "payment-sync", "refund-online"].includes(action)) {
        if (action === "checkout") {
          if (u.id !== b.guest_id) fail("仅游客本人可付款", 403);
          return payments.checkout(b.id);
        }
        if (action === "refund-online") {
          role(u, "admin", "finance");
          return payments.refund(b.id, data, u);
        }
        if (u.id !== b.guest_id && !["admin", "finance"].includes(u.role))
          fail("无支付核对权限", 403);
        return payments.sync(b.id);
      }
      if (
        [
          "cancel",
          "confirm-payment",
          "refund",
          "settle",
          "propose-change",
        ].includes(action) &&
        (payments.busy(b.id) || payments.pendingRefund(b.id))
      )
        fail("支付或退款正在核对，请稍后操作", 409);
      if (
        ["confirm-payment", "refund", "payment-report"].includes(action) &&
        payments.attempt(b.id)
      )
        fail("此订单已进入在线支付流程，请通过支付渠道核对或原路退款", 409);
      if (action === "messages") {
        const cid = chat.byBooking(b.id);
        if (!cid) fail("地陪确认接单后将自动开启会话", 409);
        return chat.send(cid, u, { ...data, clientId: data.clientId || id() });
      }
      if (action === "accept") {
        if (u.id !== b.guide_user) fail("仅地陪可接受", 403);
        return transaction(() => {
          b = booking(b.id, u);
          if (b.status !== "requested") fail("订单状态已改变", 409);
          const g = one("SELECT * FROM guides WHERE id=?", b.guide_id);
          if (
            g.status !== "approved" ||
            g.paused ||
            !fits(g, b.start, b.end, b.id)
          )
            fail("档期已冲突或地陪不可接单", 409);
          run(
            "UPDATE bookings SET status='awaiting_payment',expires=?,updated=? WHERE id=?",
            Math.min(now() + settings().paymentMinutes * 60000, b.start),
            now(),
            b.id,
          );
          chat.ensure(b.id);
          participants(
            b,
            "地陪已接受预约，专属会话已开启，请在付款期限内完成付款",
          );
          log(u, "booking.accept", b.id);
          return { ok: true };
        });
      }
      if (action === "reject") {
        if (u.id !== b.guide_user || b.status !== "requested")
          fail("无法拒绝该订单");
        run(
          "UPDATE bookings SET status='rejected',updated=? WHERE id=?",
          now(),
          b.id,
        );
        participants(b, "地陪未能接受预约");
        log(u, "booking.reject", b.id, clean(data.reason));
        return { ok: true };
      }
      if (action === "cancel") {
        if (!["requested", "awaiting_payment", "confirmed"].includes(b.status))
          fail("当前状态无法取消");
        const reason = clean(data.reason);
        if (!reason) fail("请说明取消原因");
        if (["paid", "partially_refunded"].includes(b.payment_status)) {
          run(
            "INSERT INTO cases VALUES(?,?,?,?,?,?,'open','',?)",
            id(),
            b.id,
            u.id,
            "cancellation",
            reason,
            "",
            now(),
          );
          admins("有已付款订单申请取消", b.id);
          participants(b, "取消申请已提交，等待平台处理；尚未退款");
          log(u, "booking.cancel_requested", b.id, reason);
        } else {
          run(
            "UPDATE bookings SET status='cancelled',updated=? WHERE id=?",
            now(),
            b.id,
          );
          participants(b, "预约已取消，档期已释放");
          log(u, "booking.cancelled", b.id, reason);
        }
        return { ok: true };
      }
      if (action === "payment-report") {
        if (u.id !== b.guest_id || b.status !== "awaiting_payment")
          fail("当前订单无法提交付款凭证");
        if (!manualPayments || !settings().paymentInstructions)
          fail("支付尚未启用，请联系平台；请勿转账", 503);
        let ref = clean(data.reference, 200);
        if (!ref) fail("请输入转账参考号");
        run(
          "INSERT INTO cases VALUES(?,?,?,?,?,?,'open','',?)",
          id(),
          b.id,
          u.id,
          "payment",
          ref,
          clean(data.evidence),
          now(),
        );
        admins("有转账待核对，请在预约超时前确认", b.id);
        return { ok: true };
      }
      if (action === "confirm-payment") {
        role(u, "admin", "finance");
        if (!manualPayments) fail("人工收款未启用");
        const ref = clean(data.reference, 200);
        if (!ref) fail("需要实际收款参考号");
        return transaction(() => {
          const existing = one("SELECT * FROM ledger WHERE reference=?", ref);
          if (existing) {
            if (existing.booking_id === b.id && existing.kind === "payment")
              return { ok: true };
            fail("该收款参考号已使用", 409);
          }
          b = booking(b.id, u);
          if (b.status !== "awaiting_payment")
            fail("订单已超时或状态不符，不可直接确认；请核对并处理迟到款", 409);
          run(
            "INSERT INTO ledger VALUES(?,?,?,?,?,?,?)",
            id(),
            b.id,
            "payment",
            b.total,
            ref,
            u.id,
            now(),
          );
          run(
            "UPDATE bookings SET status='confirmed',payment_status='paid',expires=NULL,updated=? WHERE id=?",
            now(),
            b.id,
          );
          run(
            "UPDATE cases SET status='resolved',resolution='收款已核对' WHERE booking_id=? AND kind='payment' AND status='open'",
            b.id,
          );
          participants(b, "收款已核对，预约正式确认");
          log(u, "payment.confirmed", b.id, ref);
          return { ok: true };
        });
      }
      if (action === "start") {
        if (
          u.id !== b.guide_user ||
          b.status !== "confirmed" ||
          now() < b.start - 900000
        )
          fail("仅地陪可在开始前15分钟内确认开始");
        run(
          "UPDATE bookings SET status='in_service',updated=? WHERE id=?",
          now(),
          b.id,
        );
        participants(b, "服务已开始");
        log(u, "service.started", b.id);
        return { ok: true };
      }
      if (action === "finish") {
        if (u.id !== b.guide_user || b.status !== "in_service")
          fail("当前无法申请完成");
        run(
          "UPDATE bookings SET status='completion_pending',updated=? WHERE id=?",
          now(),
          b.id,
        );
        participants(b, "地陪已申请结束服务，请游客确认");
        return { ok: true };
      }
      if (action === "complete") {
        if (u.id !== b.guest_id || b.status !== "completion_pending")
          fail("当前无法确认完成");
        run(
          "UPDATE bookings SET status='completed',settlement_status='pending',updated=? WHERE id=?",
          now(),
          b.id,
        );
        participants(b, "游客已确认服务完成，可以评价");
        log(u, "service.completed", b.id);
        return { ok: true };
      }
      if (action === "review") {
        if (u.id !== b.guest_id || b.status !== "completed")
          fail("仅已完成订单的游客可评价");
        let body = clean(data.body);
        if (!body) fail("请输入评价");
        if (one("SELECT id FROM reviews WHERE booking_id=?", b.id))
          fail("此订单已评价");
        run(
          "INSERT INTO reviews VALUES(?,?,?,?,?,?,1,?,?)",
          id(),
          b.id,
          u.id,
          b.guide_id,
          integer(data.rating, 1, 5),
          body,
          "",
          now(),
        );
        return { ok: true };
      }
      if (action === "case") {
        let body = clean(data.body);
        if (!body) fail("请描述问题");
        let kind = ["complaint", "refund", "review_appeal"].includes(data.kind)
          ? data.kind
          : "complaint";
        run(
          "INSERT INTO cases VALUES(?,?,?,?,?,?,'open','',?)",
          id(),
          b.id,
          u.id,
          kind,
          body,
          clean(data.evidence),
          now(),
        );
        admins("收到订单售后申请", b.id);
        log(u, "case.opened", b.id, kind);
        return { ok: true };
      }
      if (action === "refund") {
        role(u, "admin", "finance");
        const amount = integer(data.amount, 1, b.total - b.refund),
          reference = clean(data.reference, 200),
          reason = clean(data.reason);
        if (!reference || !reason) fail("须填写实际退款参考号和原因");
        if (
          !["paid", "partially_refunded"].includes(b.payment_status) ||
          b.settlement_status === "paid"
        )
          fail("当前无法录入退款");
        return transaction(() => {
          let totalRefund = b.refund + amount;
          run(
            "INSERT INTO ledger VALUES(?,?,?,?,?,?,?)",
            id(),
            b.id,
            "refund",
            amount,
            reference,
            u.id,
            now(),
          );
          run(
            "UPDATE bookings SET refund=?,payment_status=?,status=?,settlement_status=?,updated=? WHERE id=?",
            totalRefund,
            totalRefund === b.total ? "refunded" : "partially_refunded",
            data.cancel || totalRefund === b.total ? "cancelled" : b.status,
            data.cancel || totalRefund === b.total
              ? "pending"
              : b.settlement_status,
            now(),
            b.id,
          );
          participants(b, "平台已登记实际退款，请核对到账");
          log(u, "refund.recorded", b.id, `${amount}: ${reason}`);
          return { ok: true };
        });
      }
      if (action === "settle") {
        role(u, "admin", "finance");
        if (
          !["completed", "cancelled"].includes(b.status) ||
          !["paid", "partially_refunded", "refunded"].includes(
            b.payment_status,
          ) ||
          b.settlement_status === "paid"
        )
          fail("订单不可结算");
        if (
          now() < b.updated + settings().settlementHours * 3600000 ||
          one("SELECT id FROM cases WHERE booking_id=? AND status='open'", b.id)
        )
          fail("仍在结算等待期或存在未解决的售后");
        const amount = Math.max(
            0,
            b.total -
              b.refund -
              Math.round((b.commission * (b.total - b.refund)) / b.total),
          ),
          reference = clean(data.reference, 200);
        if (!reference) fail("请填写实际结算参考号");
        return transaction(() => {
          run(
            "INSERT INTO ledger VALUES(?,?,?,?,?,?,?)",
            id(),
            b.id,
            "settlement",
            amount,
            reference,
            u.id,
            now(),
          );
          run("UPDATE bookings SET settlement_status='paid' WHERE id=?", b.id);
          notify(b.guide_user, "平台已登记结算，请核对收款", b.id);
          log(u, "settlement.recorded", b.id, reference);
          return { ok: true };
        });
      }
      if (action === "propose-change") {
        role(u, "admin", "support");
        if (!["confirmed", "requested"].includes(b.status))
          fail("当前订单不可提出改期");
        if (
          one(
            "SELECT id FROM changes WHERE booking_id=? AND status='pending'",
            b.id,
          )
        )
          fail("已有改期申请待处理");
        const { start, end } = timeInput(
          data.date,
          data.time,
          (b.end - b.start) / 3600000,
        );
        if (!clean(data.reason)) fail("请填写改期原因");
        run(
          "INSERT INTO changes VALUES(?,?,?,?,?,?,0,0,'pending',?)",
          id(),
          b.id,
          start,
          end,
          clean(data.meeting, 200),
          clean(data.reason),
          now(),
        );
        participants(b, "平台提出了改期方案，请双方确认；原档期暂时保留");
        log(u, "booking.change_proposed", b.id, clean(data.reason));
        return { ok: true };
      }
      if (action === "respond-change")
        return transaction(() => {
          if (u.id !== b.guest_id && u.id !== b.guide_user)
            fail("仅订单双方可确认", 403);
          const ch = one(
            "SELECT * FROM changes WHERE id=? AND booking_id=? AND status='pending'",
            data.changeId,
            b.id,
          );
          if (!ch) fail("改期方案已失效");
          if (!data.accept) {
            run("UPDATE changes SET status='rejected' WHERE id=?", ch.id);
            participants(b, "改期未获同意，保留原安排");
            return { ok: true };
          }
          run(
            `UPDATE changes SET ${u.id === b.guest_id ? "guest_ok" : "guide_ok"}=1 WHERE id=?`,
            ch.id,
          );
          const updated = one("SELECT * FROM changes WHERE id=?", ch.id);
          if (updated.guest_ok && updated.guide_ok) {
            b = booking(b.id, u);
            if (
              !["requested", "confirmed"].includes(b.status) ||
              ch.start <= now()
            )
              fail("订单状态或改期时间已失效");
            if (
              !fits(
                one("SELECT * FROM guides WHERE id=?", b.guide_id),
                ch.start,
                ch.end,
                b.id,
              )
            )
              fail("新档期已被占用，请联系平台", 409);
            run(
              "UPDATE bookings SET start=?,end=?,meeting=?,expires=CASE WHEN status='requested' THEN MIN(expires,?) ELSE expires END,updated=? WHERE id=?",
              ch.start,
              ch.end,
              ch.meeting,
              ch.start,
              now(),
              b.id,
            );
            run("UPDATE changes SET status='applied' WHERE id=?", ch.id);
            participants(b, "双方已同意改期，订单安排已更新");
            log(u, "booking.change_applied", b.id);
          }
          return { ok: true };
        });
      fail("操作不存在", 404);
    }
    if (path === "/api/notifications") {
      need(u);
      if (method === "GET")
        return q(
          "SELECT * FROM notifications WHERE user_id=? ORDER BY created DESC LIMIT 50",
          u.id,
        );
      if (method === "POST") {
        run("UPDATE notifications SET is_read=1 WHERE user_id=?", u.id);
        return { ok: true };
      }
    }
    if (path.startsWith("/api/admin")) {
      if (path === "/api/admin/guides" && method === "GET") {
        role(u, "admin", "reviewer", "support");
        return q("SELECT * FROM guides ORDER BY created DESC").map((g) => ({
          ...publicGuide(g),
          status: g.status,
          paused: !!g.paused,
          reviewNote: g.review_note,
          availability: q("SELECT * FROM availability WHERE guide_id=?", g.id),
        }));
      }
      if (path === "/api/admin/guide" && method === "POST") {
        role(u, "admin", "reviewer");
        const g = one("SELECT * FROM guides WHERE id=?", data.id);
        if (!g) fail("地陪不存在");
        if (
          !["approved", "rejected", "needs_changes", "suspended"].includes(
            data.status,
          )
        )
          fail("状态无效");
        const reason = clean(data.reason);
        if (!reason) fail("请填写审核意见");
        run(
          "UPDATE guides SET status=?,review_note=? WHERE id=?",
          data.status,
          reason,
          g.id,
        );
        notify(g.user_id, `资料审核状态：${data.status}。${reason}`);
        log(u, "guide.review", g.id, `${data.status}: ${reason}`);
        return { ok: true };
      }
      if (path === "/api/admin/availability" && method === "POST") {
        role(u, "admin", "support");
        const g = one("SELECT * FROM guides WHERE id=?", data.guideId);
        if (!g) fail("地陪不存在");
        if (!clean(data.reason)) fail("请填写原因");
        if (data.removeId)
          run(
            "DELETE FROM availability WHERE id=? AND guide_id=?",
            data.removeId,
            g.id,
          );
        else {
          const start = integer(data.start, 0, 1439),
            end = integer(data.end, 1, 1440);
          if (end <= start || !/^\d{4}-\d{2}-\d{2}$/.test(data.date))
            fail("时间无效");
          run(
            "INSERT INTO availability VALUES(?,?,NULL,?,?,?,?)",
            id(),
            g.id,
            data.date,
            start,
            end,
            data.blocked ? 1 : 0,
          );
        }
        notify(g.user_id, "平台协助调整了档期，请查看。" + clean(data.reason));
        log(u, "availability.admin_changed", g.id, clean(data.reason));
        return { ok: true };
      }
      if (path === "/api/admin/cases" && method === "GET") {
        role(u, "admin", "support", "finance");
        return q(
          "SELECT c.*,u.name FROM cases c JOIN users u ON c.user_id=u.id ORDER BY c.created DESC",
        );
      }
      if (path === "/api/admin/case" && method === "POST") {
        role(u, "admin", "support", "finance");
        if (!clean(data.resolution)) fail("请填写处理结果");
        let c = one("SELECT * FROM cases WHERE id=?", data.id);
        if (!c) fail("记录不存在");
        run(
          "UPDATE cases SET status='resolved',resolution=? WHERE id=?",
          clean(data.resolution),
          c.id,
        );
        notify(
          c.user_id,
          "售后处理结果：" + clean(data.resolution),
          c.booking_id,
        );
        log(u, "case.resolved", c.id, clean(data.resolution));
        return { ok: true };
      }
      if (path === "/api/admin/reviews" && method === "GET") {
        role(u, "admin", "support");
        return q(
          "SELECT r.*,u.name FROM reviews r JOIN users u ON u.id=r.guest_id ORDER BY r.created DESC",
        );
      }
      if (path === "/api/admin/review" && method === "POST") {
        role(u, "admin", "support");
        if (!clean(data.reason)) fail("请填写审核原因");
        run(
          "UPDATE reviews SET visible=?,moderation_note=? WHERE id=?",
          data.visible ? 1 : 0,
          clean(data.reason),
          data.id,
        );
        log(u, "review.moderated", data.id, clean(data.reason));
        return { ok: true };
      }
      if (path === "/api/admin/settings" && method === "POST") {
        role(u, "admin");
        return transaction(() => {
          for (let [k, v] of Object.entries(data)) {
            if (!(k in defaults)) continue;
            if (typeof defaults[k] === "number")
              v = integer(
                v,
                k === "commission" ? 0 : 1,
                k === "commission" ? 40 : k === "bufferMinutes" ? 180 : 168,
              );
            else v = clean(v, 4000);
            run(
              "UPDATE settings SET value=? WHERE key=?",
              JSON.stringify(v),
              k,
            );
          }
          log(u, "settings.updated", "platform", Object.keys(data).join(","));
          return { ok: true };
        });
      }
      if (path === "/api/admin/users" && method === "GET") {
        role(u, "admin");
        return q("SELECT id,name,email,role FROM users ORDER BY created DESC");
      }
      if (path === "/api/admin/role" && method === "POST") {
        role(u, "admin");
        if (u.id === data.id) fail("不能修改自己的权限");
        if (
          ![
            "guest",
            "guide",
            "admin",
            "support",
            "finance",
            "reviewer",
          ].includes(data.role)
        )
          fail("角色无效");
        const target = one("SELECT * FROM users WHERE id=?", data.id);
        if (!target) fail("用户不存在");
        if (guideFor(target) && data.role !== "guide")
          fail("已关联地陪资料的账户不能改为其他角色");
        run("UPDATE users SET role=? WHERE id=?", data.role, data.id);
        run("DELETE FROM sessions WHERE user_id=?", data.id);
        log(u, "user.role", data.id, data.role);
        return { ok: true };
      }
      if (path === "/api/admin/audit" && method === "GET") {
        role(u, "admin");
        return q(
          "SELECT a.*,u.name FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.created DESC LIMIT 200",
        );
      }
      if (path === "/api/admin/stats" && method === "GET") {
        role(u, "admin", "support", "finance");
        const bs = q("SELECT * FROM bookings");
        return {
          guides: one("SELECT COUNT(*) n FROM guides").n,
          approved: one("SELECT COUNT(*) n FROM guides WHERE status='approved'")
            .n,
          bookings: bs.length,
          searches: one("SELECT COUNT(*) n FROM events WHERE kind='search'").n,
          paid: bs.filter((b) => b.payment_status !== "unpaid").length,
          completed: bs.filter((b) => b.status === "completed").length,
          revenue: bs
            .filter((b) => b.payment_status !== "unpaid")
            .reduce((s, b) => s + b.total - b.refund, 0),
          refunded: bs.reduce((s, b) => s + b.refund, 0),
          purposes: purposes.map((p) => ({
            purpose: p,
            searches: q("SELECT * FROM events").filter((e) =>
              jsonList(e.purposes).includes(p),
            ).length,
            bookings: bs.filter((b) => jsonList(b.purposes).includes(p)).length,
          })),
          cities: cities.map((c) => ({
            city: c,
            count: bs.filter((b) => b.city === c).length,
          })),
        };
      }
    }
    fail("接口不存在", 404);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    try {
      let url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        if (
          process.env.BACKEND_GATEWAY_TOKEN &&
          url.pathname !== "/api/health"
        ) {
          const actual = hash(String(req.headers["x-gateway-token"] || ""));
          const expected = hash(process.env.BACKEND_GATEWAY_TOKEN);
          if (!timingSafeEqual(Buffer.from(actual), Buffer.from(expected)))
            fail("接口不可直接访问", 403);
        }
        res.setHeader("Cache-Control", "no-store");
        const result = await api(req, res, url);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(result));
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) fail("不支持此操作", 405);
      const dist = resolve(ROOT, "dist"),
        candidate = resolve(dist, "." + decodeURIComponent(url.pathname));
      let path =
        candidate.startsWith(dist + "/") &&
        existsSync(candidate) &&
        statSync(candidate).isFile()
          ? candidate
          : resolve(dist, "index.html");
      if (!existsSync(path)) fail("请先构建前端", 503);
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".jpg": "image/jpeg",
          ".png": "image/png",
        }[extname(path)] || "application/octet-stream",
      );
      res.end(readFileSync(path));
    } catch (e) {
      res.statusCode =
        e.status || (String(e.message).includes("UNIQUE") ? 409 : 500);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          error: e.status
            ? e.message
            : res.statusCode === 409
              ? "该记录已处理，请刷新"
              : "服务暂时不可用，请重试",
        }),
      );
      if (res.statusCode === 500) console.error(e);
    }
  });
  const timer = setInterval(() => {
    try {
      expire();
      void payments.sweep();
    } catch (e) {
      console.error(e);
    }
  }, 30000);
  timer.unref();
  server.on("close", () => {
    clearInterval(timer);
    db.close();
  });
  return { server, db, createUser, settings, payments };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApp();
  if (process.argv.includes("--create-admin")) {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
      throw Error("设置 ADMIN_EMAIL 和 ADMIN_PASSWORD 后重试");
    app.createUser(
      process.env.ADMIN_EMAIL,
      process.env.ADMIN_PASSWORD,
      process.env.ADMIN_NAME || "平台管理员",
      "admin",
    );
    console.log("管理员已创建");
    app.server.close();
    process.exit(0);
  }
  app.server.listen(
    Number(process.env.PORT) || 3001,
    process.env.HOST || "127.0.0.1",
    () => console.log("KoreaMate server listening"),
  );
}
