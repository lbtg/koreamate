import { randomUUID } from "node:crypto";
const error = (message, status = 409) => {
  throw Object.assign(new Error(message), { status });
};
const now = () => Date.now();
// Only server-to-server responses from Toss are authoritative. No card data is stored.
export function createPayments({
  db,
  one,
  q,
  run,
  transaction,
  log,
  admins,
  participants,
  secretKey = process.env.TOSS_SECRET_KEY || "",
  appOrigin = process.env.APP_ORIGIN || "",
  enabled = process.env.PAYMENTS_ENABLED === "true",
  fetcher = fetch,
}) {
  db.exec(`CREATE TABLE IF NOT EXISTS payment_attempts(
    booking_id TEXT PRIMARY KEY REFERENCES bookings(id), order_id TEXT UNIQUE NOT NULL,
    payment_key TEXT UNIQUE, checkout_url TEXT, state TEXT NOT NULL, total INTEGER NOT NULL,
    authorize_started INTEGER, error_code TEXT DEFAULT '', created INTEGER, updated INTEGER);
  CREATE TABLE IF NOT EXISTS payment_refunds(
    id TEXT PRIMARY KEY, booking_id TEXT REFERENCES bookings(id), amount INTEGER, reason TEXT,
    cancel_booking INTEGER, state TEXT, created INTEGER, updated INTEGER, expected_refund INTEGER);
  CREATE INDEX IF NOT EXISTS refunds_pending ON payment_refunds(booking_id,state);`);
  if (
    !q("PRAGMA table_info(payment_refunds)").some(
      (c) => c.name === "expected_refund",
    )
  )
    db.exec("ALTER TABLE payment_refunds ADD COLUMN expected_refund INTEGER");
  const configured =
    enabled &&
    /^(test|live)_(g?sk)_/.test(secretKey) &&
    /^https?:\/\//.test(appOrigin);
  if (enabled && !configured)
    throw Error("支付已要求启用，但 TOSS_SECRET_KEY 或 APP_ORIGIN 配置不完整");
  if (
    configured &&
    secretKey.startsWith("live_") &&
    !appOrigin.startsWith("https://")
  )
    throw Error("正式收款必须使用 HTTPS APP_ORIGIN");
  const origin = appOrigin ? new URL(appOrigin).origin : "";
  const config = {
    enabled: configured,
    provider: "toss",
    mode: secretKey.startsWith("live_") ? "live" : "test",
    currency: "KRW",
    methods: ["CARD"],
  };
  const attempt = (bid) =>
    one("SELECT * FROM payment_attempts WHERE booking_id=?", bid);
  const booking = (bid) =>
    one(
      "SELECT b.*,g.user_id guide_user FROM bookings b JOIN guides g ON g.id=b.guide_id WHERE b.id=?",
      bid,
    );
  const pendingRefund = (bid) =>
    one(
      "SELECT * FROM payment_refunds WHERE booking_id=? AND state IN ('pending','unknown')",
      bid,
    );
  const locks = new Set();
  const exclusive = async (bid, fn) => {
    if (locks.has(bid)) error("支付正在处理，请稍后刷新", 409);
    locks.add(bid);
    try {
      return await fn();
    } finally {
      locks.delete(bid);
    }
  };
  const required = () => {
    if (!configured) error("在线支付尚未开通，请联系平台；请勿自行转账", 503);
  };
  async function request(path, method = "GET", body, key) {
    let res;
    try {
      res = await fetcher("https://api.tosspayments.com" + path, {
        method,
        signal: AbortSignal.timeout(12000),
        redirect: "error",
        headers: {
          Authorization:
            "Basic " + Buffer.from(secretKey + ":").toString("base64"),
          "Content-Type": "application/json",
          "Accept-Language": "en-US",
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      error("支付渠道暂时未响应，结果待核对，请勿重复付款", 503);
    }
    let result;
    try {
      result = await res.json();
    } catch {
      error("支付渠道响应异常，请稍后核对", 503);
    }
    if (!res.ok)
      throw Object.assign(
        new Error("支付渠道暂未完成操作，请刷新核对或联系平台"),
        {
          status: 502,
          providerCode: String(result.code || "PROVIDER_ERROR").slice(0, 80),
        },
      );
    return result;
  }
  function verify(p, a) {
    if (
      !p ||
      p.orderId !== a.order_id ||
      p.currency !== "KRW" ||
      p.totalAmount !== a.total ||
      typeof p.paymentKey !== "string" ||
      !p.paymentKey ||
      (a.payment_key && p.paymentKey !== a.payment_key)
    )
      error("支付信息与订单不一致，已停止处理", 502);
  }
  function issue(b, body) {
    if (
      !one(
        "SELECT id FROM cases WHERE booking_id=? AND kind='payment_exception' AND status='open'",
        b.id,
      )
    ) {
      run(
        "INSERT INTO cases VALUES(?,?,?,?,?,?,'open','',?)",
        randomUUID(),
        b.id,
        b.guest_id,
        "payment_exception",
        body,
        "",
        now(),
      );
      admins(body, b.id);
    }
  }
  function apply(p, a) {
    verify(p, a);
    return transaction(() => {
      let b = booking(a.booking_id);
      run(
        "UPDATE payment_attempts SET payment_key=?,updated=? WHERE booking_id=?",
        p.paymentKey,
        now(),
        b.id,
      );
      if (
        ["DONE", "PARTIAL_CANCELED", "CANCELED"].includes(p.status) &&
        p.approvedAt
      ) {
        // Ignore never-authorized READY cancellations. Approved payments always have approvedAt.
        if (!p.approvedAt) error("支付渠道没有提供已批准的交易记录", 502);
        const paidRef = "toss:payment:" + a.order_id;
        const already = one("SELECT id FROM ledger WHERE reference=?", paidRef);
        if (!already) {
          run(
            "INSERT INTO ledger VALUES(?,?,?,?,?,?,?)",
            randomUUID(),
            b.id,
            "payment",
            a.total,
            paidRef,
            null,
            now(),
          );
          const valid =
            b.status === "awaiting_payment" &&
            b.payment_status === "unpaid" &&
            a.authorize_started &&
            a.authorize_started <= b.expires;
          run(
            "UPDATE bookings SET payment_status='paid',status=?,expires=NULL,updated=? WHERE id=?",
            valid ? "confirmed" : b.status,
            now(),
            b.id,
          );
          if (!valid)
            issue(
              b,
              "收到无法直接履约的支付，请核对并原路退款；订单没有自动恢复。",
            );
          participants(
            b,
            valid
              ? "支付渠道已确认收款，预约正式成立"
              : "付款正在异常核对，预约尚未确认，请联系平台",
          );
          log(null, "payment.verified", b.id, paidRef);
        }
        const cancels = p.cancels || [];
        for (const c of cancels) {
          if (c.cancelStatus !== "DONE") continue;
          if (
            typeof c.transactionKey !== "string" ||
            !Number.isInteger(c.cancelAmount) ||
            c.cancelAmount < 1
          )
            error("退款记录无效", 502);
          const ref = "toss:refund:" + c.transactionKey;
          const existing = one("SELECT * FROM ledger WHERE reference=?", ref);
          if (
            existing &&
            (existing.booking_id !== b.id || existing.amount !== c.cancelAmount)
          )
            error("退款流水冲突", 502);
          if (!existing)
            run(
              "INSERT INTO ledger VALUES(?,?,?,?,?,?,?)",
              randomUUID(),
              b.id,
              "refund",
              c.cancelAmount,
              ref,
              null,
              now(),
            );
        }
        const refunded = one(
          "SELECT COALESCE(SUM(amount),0) total FROM ledger WHERE booking_id=? AND kind='refund'",
          b.id,
        ).total;
        if (
          refunded > a.total ||
          !Number.isInteger(p.balanceAmount) ||
          refunded !== a.total - p.balanceAmount
        )
          error("退款金额核对不一致", 502);
        if (refunded < b.refund) error("过期支付状态，稍后重新同步", 409);
        run(
          "UPDATE bookings SET refund=?,payment_status=?,status=CASE WHEN ? THEN 'cancelled' ELSE status END,settlement_status=CASE WHEN ? AND settlement_status!='paid' THEN 'pending' ELSE settlement_status END,updated=CASE WHEN refund!=? THEN ? ELSE updated END WHERE id=?",
          refunded,
          refunded === a.total
            ? "refunded"
            : refunded
              ? "partially_refunded"
              : "paid",
          refunded === a.total ? 1 : 0,
          refunded === a.total ? 1 : 0,
          refunded,
          now(),
          b.id,
        );
        run(
          "UPDATE payment_attempts SET state=?,error_code='',updated=? WHERE booking_id=?",
          refunded === a.total ? "refunded" : "paid",
          now(),
          b.id,
        );
        if (refunded > b.refund) {
          participants(b, "支付渠道已确认退款，实际到账时间以银行为准");
          log(null, "refund.verified", b.id, String(refunded));
        }
        return {
          ok: true,
          bookingId: b.id,
          status: booking(b.id).status,
          paymentStatus: booking(b.id).payment_status,
        };
      }
      if (["ABORTED", "EXPIRED", "CANCELED"].includes(p.status))
        run(
          "UPDATE payment_attempts SET state='failed',updated=? WHERE booking_id=?",
          now(),
          b.id,
        );
      return { ok: false, pending: true, bookingId: b.id };
    });
  }
  async function retrieve(a) {
    return request(
      "/v1/payments/" +
        (a.payment_key
          ? encodeURIComponent(a.payment_key)
          : "orders/" + encodeURIComponent(a.order_id)),
    );
  }
  async function settleAttempt(a, { authorize = false } = {}) {
    let p = await retrieve(a);
    verify(p, a);
    if (authorize && a.authorize_started && p.status === "IN_PROGRESS") {
      p = await request(
        "/v1/payments/confirm",
        "POST",
        { paymentKey: p.paymentKey, orderId: a.order_id, amount: a.total },
        "km-confirm-" + a.order_id,
      );
    }
    return apply(p, attempt(a.booking_id));
  }
  async function checkout(bid) {
    required();
    return exclusive(bid, async () => {
      const b = booking(bid);
      if (
        b.status !== "awaiting_payment" ||
        b.expires <= now() ||
        b.payment_status !== "unpaid"
      )
        error("当前订单无法发起付款");
      let a = attempt(bid);
      if (
        a &&
        ["confirming", "unknown", "paid", "refunded", "failed"].includes(
          a.state,
        )
      )
        error("该支付正在核对或已结束，请刷新订单");
      if (!a) {
        run(
          "INSERT INTO payment_attempts VALUES(?,?,NULL,NULL,'creating',?,NULL,'',?,?)",
          bid,
          "km_" + randomUUID(),
          b.total,
          now(),
          now(),
        );
        a = attempt(bid);
      }
      if (!a.checkout_url) {
        const p = await request(
          "/v1/payments",
          "POST",
          {
            method: "CARD",
            amount: a.total,
            currency: "KRW",
            orderId: a.order_id,
            orderName: "KoreaMate 地陪预约",
            successUrl: origin + "/payments/success",
            failUrl: origin + "/payments/fail",
          },
          "km-create-" + a.order_id,
        );
        verify(p, a);
        const url = new URL(p.checkout?.url || "https://invalid.local");
        if (
          url.protocol !== "https:" ||
          !(
            url.hostname === "tosspayments.com" ||
            url.hostname.endsWith(".tosspayments.com")
          )
        )
          error("支付跳转地址异常", 502);
        // Re-check after network I/O; cancellation and timeout can happen meanwhile.
        const fresh = booking(bid);
        if (fresh.status !== "awaiting_payment" || fresh.expires <= now())
          error("预约已关闭，请重新预约");
        run(
          "UPDATE payment_attempts SET payment_key=?,checkout_url=?,state='ready',updated=? WHERE booking_id=?",
          p.paymentKey,
          url.href,
          now(),
          bid,
        );
        a = attempt(bid);
      }
      return { url: a.checkout_url, mode: config.mode };
    });
  }
  async function confirm(bid, data) {
    required();
    return exclusive(bid, async () => {
      let a = attempt(bid),
        b = booking(bid);
      if (
        !a ||
        data.orderId !== a.order_id ||
        data.paymentKey !== a.payment_key ||
        Number(data.amount) !== a.total
      )
        error("支付返回参数不匹配", 400);
      if (["paid", "refunded"].includes(a.state))
        return { ok: true, bookingId: bid, status: b.status };
      if (!a.authorize_started) {
        if (
          b.status !== "awaiting_payment" ||
          b.expires <= now() ||
          b.payment_status !== "unpaid" ||
          a.state !== "ready"
        )
          error("预约已超时或已取消，没有扣款");
        run(
          "UPDATE payment_attempts SET state='confirming',authorize_started=?,updated=? WHERE booking_id=?",
          now(),
          now(),
          bid,
        );
      }
      try {
        return await settleAttempt(attempt(bid), { authorize: true });
      } catch (e) {
        run(
          "UPDATE payment_attempts SET state='unknown',error_code=?,updated=? WHERE booking_id=?",
          e.providerCode || "RECONCILE_REQUIRED",
          now(),
          bid,
        );
        throw e;
      }
    });
  }
  async function sync(bid) {
    required();
    return exclusive(bid, async () => {
      const a = attempt(bid);
      if (!a) error("该订单尚未发起在线支付", 404);
      return settleAttempt(a, {
        authorize:
          ["confirming", "unknown"].includes(a.state) && !!a.authorize_started,
      });
    });
  }
  async function processRefund(r) {
    const a = attempt(r.booking_id);
    // Never replay a request outside provider's 15-day idempotency window.
    if (now() - r.created > 14 * 86400000) {
      issue(
        booking(r.booking_id),
        "退款核对超过自动重试期限，请在支付商户后台核对后同步。",
      );
      error("退款需要人工核对", 409);
    }
    const p = await request(
      "/v1/payments/" + encodeURIComponent(a.payment_key) + "/cancel",
      "POST",
      { cancelReason: r.reason, cancelAmount: r.amount },
      "km-refund-" + r.id,
    );
    apply(p, a);
    if (
      r.expected_refund == null ||
      a.total - p.balanceAmount < r.expected_refund
    )
      error("退款正在处理，请稍后核对", 503);
    transaction(() => {
      run(
        "UPDATE payment_refunds SET state='done',updated=? WHERE id=?",
        now(),
        r.id,
      );
      if (r.cancel_booking)
        run(
          "UPDATE bookings SET status='cancelled',settlement_status='pending',updated=? WHERE id=?",
          now(),
          r.booking_id,
        );
      log(null, "refund.completed", r.booking_id, r.id);
    });
    return { ok: true, bookingId: r.booking_id };
  }
  async function refund(bid, data, actor) {
    required();
    return exclusive(bid, async () => {
      const b = booking(bid),
        a = attempt(bid),
        amount = Number(data.amount),
        reason = String(data.reason || "")
          .trim()
          .slice(0, 200),
        key = String(data.requestKey || "");
      if (
        !/^[a-zA-Z0-9_-]{16,64}$/.test(key) ||
        !reason ||
        !Number.isInteger(amount) ||
        amount < 1
      )
        error("请输入退款金额、原因与有效请求编号", 400);
      let r = one("SELECT * FROM payment_refunds WHERE id=?", key);
      if (
        r &&
        (r.booking_id !== bid ||
          r.amount !== amount ||
          r.reason !== reason ||
          r.cancel_booking !== (data.cancel ? 1 : 0))
      )
        error("退款请求编号已用于另一项操作");
      if (r?.state === "done") return { ok: true };
      if (
        !a ||
        (!r && a.state !== "paid") ||
        b.settlement_status === "paid" ||
        (!r && amount > b.total - b.refund)
      )
        error("当前订单无法原路退款");
      if (!r) {
        if (pendingRefund(bid)) error("已有退款正在核对，请勿重复发起");
        run(
          "INSERT INTO payment_refunds VALUES(?,?,?,?,?,'pending',?,?,?)",
          key,
          bid,
          amount,
          reason,
          data.cancel ? 1 : 0,
          now(),
          now(),
          b.refund + amount,
        );
        r = one("SELECT * FROM payment_refunds WHERE id=?", key);
        log(actor, "refund.requested", bid, `${amount}: ${reason}`);
      }
      try {
        return await processRefund(r);
      } catch (e) {
        run(
          "UPDATE payment_refunds SET state='unknown',updated=? WHERE id=?",
          now(),
          key,
        );
        throw e;
      }
    });
  }
  async function webhook(data) {
    required();
    // PAYMENT_STATUS_CHANGED has no general signature in this API. Ignore its claimed
    // status/amount; look up a server-created order, then authenticate a fresh API query.
    if (data.eventType !== "PAYMENT_STATUS_CHANGED") return { received: true };
    const a = one(
      "SELECT * FROM payment_attempts WHERE order_id=?",
      String(data.data?.orderId || ""),
    );
    if (!a) return { received: true };
    await exclusive(a.booking_id, async () => apply(await retrieve(a), a));
    return { received: true };
  }
  let sweeping = false;
  async function sweep() {
    if (!configured || sweeping) return;
    sweeping = true;
    try {
      for (const a of q(
        "SELECT * FROM payment_attempts WHERE state IN ('confirming','unknown') ORDER BY updated LIMIT 20",
      )) {
        if (locks.has(a.booking_id)) continue;
        if (a.authorize_started && now() - a.authorize_started > 900000)
          issue(
            booking(a.booking_id),
            "支付结果长期未能核对，档期仍保留，请财务在商户后台核查。",
          );
        try {
          await sync(a.booking_id);
        } catch {
          run(
            "UPDATE payment_attempts SET updated=? WHERE booking_id=?",
            now(),
            a.booking_id,
          );
        }
      }
      for (const r of q(
        "SELECT * FROM payment_refunds WHERE state IN ('pending','unknown') ORDER BY updated LIMIT 20",
      )) {
        if (locks.has(r.booking_id)) continue;
        try {
          await exclusive(r.booking_id, () => processRefund(r));
        } catch {
          run("UPDATE payment_refunds SET updated=? WHERE id=?", now(), r.id);
        }
      }
    } finally {
      sweeping = false;
    }
  }
  return {
    config,
    checkout,
    confirm,
    sync,
    refund,
    webhook,
    sweep,
    attempt,
    pendingRefund,
    busy: (bid) =>
      locks.has(bid) || ["confirming", "unknown"].includes(attempt(bid)?.state),
    lookup: (orderId) =>
      one("SELECT booking_id FROM payment_attempts WHERE order_id=?", orderId)
        ?.booking_id,
    summary: (bid) => {
      const a = attempt(bid);
      return a
        ? {
            provider: "toss",
            state: a.state,
            mode: config.mode,
            refundPending: !!pendingRefund(bid),
          }
        : null;
    },
  };
}
