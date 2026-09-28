import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
export const nativeApp = Capacitor.isNativePlatform();
export let installPrompt = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    window.dispatchEvent(new Event("km-install-ready"));
  });
}
export function clearInstallPrompt() {
  installPrompt = null;
}
export function validateApiOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error("App 服务地址必须是 HTTPS 域名");
  return url.origin;
}
export async function requestAPI(path, method, body, csrf) {
  const headers = { "Content-Type": "application/json", "X-CSRF-Token": csrf };
  if (nativeApp) {
    const origin = validateApiOrigin(import.meta.env.VITE_API_ORIGIN || "");
    // Native transport owns its cookie jar. Never copy session cookies to localStorage.
    const r = await CapacitorHttp.request({
      url: origin + "/api" + path,
      method,
      headers: { ...headers, Origin: origin },
      data: body,
      responseType: "json",
      connectTimeout: 15000,
      readTimeout: 30000,
      disableRedirects: true,
    });
    return { ok: r.status >= 200 && r.status < 300, json: async () => r.data };
  }
  return fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
export async function openCheckout(url) {
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    !(
      target.hostname === "tosspayments.com" ||
      target.hostname.endsWith(".tosspayments.com")
    )
  )
    throw Error("支付地址无效，请联系平台");
  if (nativeApp) await Browser.open({ url: target.href });
  else window.location.assign(target.href);
}
export function paymentDeepLink(url) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "koreamate:" ||
    parsed.hostname !== "payments" ||
    !["/success", "/fail"].includes(parsed.pathname)
  )
    return null;
  const query = new URLSearchParams();
  for (const key of ["paymentKey", "orderId", "amount", "code", "message"]) {
    const value = parsed.searchParams.get(key);
    if (value && value.length <= 1000) query.set(key, value);
  }
  return "/payments" + parsed.pathname + "?" + query;
}
export async function startMobileRuntime() {
  if (!nativeApp) {
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return;
  }
  document.documentElement.classList.add("native-app");
  const handle = async ({ url }) => {
    let route;
    try {
      route = paymentDeepLink(url);
    } catch {
      return;
    }
    if (!route) return;
    await Browser.close().catch(() => {});
    history.pushState({}, "", route);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  await NativeApp.addListener("appUrlOpen", handle);
  const launch = await NativeApp.getLaunchUrl();
  if (launch) await handle(launch);
  await NativeApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) history.back();
    else NativeApp.minimizeApp();
  });
  await NativeApp.addListener("appStateChange", ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event("km-resume"));
  });
}
