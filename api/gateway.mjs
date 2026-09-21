// Vercel forwards same-origin API calls to the persistent Node service.
// DATABASE_PATH must never point at Vercel's ephemeral filesystem.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const base = process.env.BACKEND_ORIGIN;
  if (!base) {
    res.statusCode = 503;
    return res.end(
      JSON.stringify({
        code: "BACKEND_NOT_CONFIGURED",
        error: "账户与预约服务正在准备上线，请稍后再试。",
      }),
    );
  }
  try {
    const origin = new URL(base);
    if (origin.protocol !== "https:" || origin.username || origin.password)
      throw Error("Invalid backend origin");
    const requestURL = new URL(req.url, "https://localhost");
    const route = requestURL.searchParams.get("route") || "";
    if (!/^[a-zA-Z0-9/_-]+$/.test(route)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "接口路径无效" }));
    }
    const target = new URL("/api/" + route, origin.origin);
    for (const [key, value] of requestURL.searchParams)
      if (key !== "route") target.searchParams.append(key, value);
    let body;
    if (!["GET", "HEAD"].includes(req.method)) {
      body =
        typeof req.body === "string" || Buffer.isBuffer(req.body)
          ? req.body
          : JSON.stringify(req.body || {});
      if (Buffer.byteLength(body) > 64000) {
        res.statusCode = 413;
        return res.end(JSON.stringify({ error: "提交内容过大" }));
      }
    }
    const headers = { "Content-Type": "application/json" };
    for (const key of ["cookie", "origin", "x-csrf-token"])
      if (req.headers[key]) headers[key] = req.headers[key];
    if (process.env.BACKEND_GATEWAY_TOKEN)
      headers["x-gateway-token"] = process.env.BACKEND_GATEWAY_TOKEN;
    const response = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    res.statusCode = response.status;
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.statusCode = 503;
    res.end(
      JSON.stringify({
        code: "BACKEND_UNAVAILABLE",
        error: "账户或支付服务暂时无法连接，请稍后核对订单，勿重复付款。",
      }),
    );
  }
}
