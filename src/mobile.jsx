import React, { useEffect, useState } from "react";
import {
  Search,
  ClipboardList,
  MessageCircle,
  UserRound,
  Download,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  WifiOff,
} from "lucide-react";
import {
  nativeApp,
  installPrompt,
  clearInstallPrompt,
} from "./mobile-runtime.js";
export function MobileNavigation({ route, user, navigate, unread, t }) {
  const guide = user?.role === "guide";
  const items = [
    [
      guide ? "/guide" : "/",
      guide ? LayoutDashboard : Search,
      guide ? t("工作台", "관리") : t("发现", "탐색"),
    ],
    ["/orders", ClipboardList, t("预约", "예약")],
    ["/messages", MessageCircle, t("消息", "메시지")],
    ["/account", UserRound, t("我的", "내 정보")],
  ];
  return (
    <nav className="mobile-tabs" aria-label="App 主导航">
      {items.map(([path, Icon, label]) => (
        <button
          key={path}
          aria-current={
            route === path || (path !== "/" && route.startsWith(path + "/"))
              ? "page"
              : undefined
          }
          onClick={() => navigate(path)}
        >
          <span>
            <Icon size={21} />
            {path === "/messages" && unread > 0 && (
              <b className="tab-badge">{unread > 99 ? "99+" : unread}</b>
            )}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
export function InstallCard() {
  const [prompt, setPrompt] = useState(installPrompt),
    [installed, setInstalled] = useState(
      () =>
        nativeApp ||
        matchMedia("(display-mode: standalone)").matches ||
        navigator.standalone,
    ),
    [hint, setHint] = useState(false);
  useEffect(() => {
    const onPrompt = () => setPrompt(installPrompt);
    const onInstall = () => {
      setInstalled(true);
      clearInstallPrompt();
      setPrompt(null);
    };
    window.addEventListener("km-install-ready", onPrompt);
    window.addEventListener("appinstalled", onInstall);
    return () => {
      window.removeEventListener("km-install-ready", onPrompt);
      window.removeEventListener("appinstalled", onInstall);
    };
  }, []);
  if (installed) return <p className="muted">KoreaMate · 手机 App 模式</p>;
  return (
    <section className="install-card">
      <Download size={23} />
      <div>
        <b>把 KoreaMate 放到手机桌面</b>
        <p>随时查看预约，与同行地陪保持联系。</p>
        <button
          className="button"
          onClick={async () => {
            if (prompt) {
              await prompt.prompt();
              await prompt.userChoice;
              clearInstallPrompt();
              setPrompt(null);
            } else setHint(!hint);
          }}
        >
          安装 / 添加到桌面
        </button>
        {hint && (
          <p className="install-help">
            iPhone：用 Safari 打开，点击“分享”→“添加到主屏幕”。Android：用
            Chrome
            打开，在浏览器菜单中选择“安装应用”或“添加到主屏幕”。如果在微信中打开，请先选择在系统浏览器打开。
          </p>
        )}
      </div>
    </section>
  );
}
export function AccountPage({ user, navigate, logout, t }) {
  return (
    <div className="page account-page">
      <div className="account-hero">
        <div className="account-avatar">
          <UserRound size={32} />
        </div>
        <div>
          <span className="eyebrow">MY KOREAMATE</span>
          <h1>
            {user ? user.name : t("你的韩国同行伙伴", "한국 여행의 동반자")}
          </h1>
          <p>{user ? user.email : "登录后管理预约、付款和专属聊天。"}</p>
        </div>
      </div>
      <div className="account-actions">
        {!user && (
          <>
            <button onClick={() => navigate("/login")}>
              游客登录 / 注册
              <ChevronRight />
            </button>
            <button onClick={() => navigate("/guide/login")}>
              地陪登录
              <ChevronRight />
            </button>
            <button onClick={() => navigate("/join")}>
              申请成为地陪
              <ChevronRight />
            </button>
          </>
        )}
        {user && (
          <>
            <button onClick={() => navigate("/orders")}>
              <ClipboardList />
              我的预约
              <ChevronRight />
            </button>
            <button onClick={() => navigate("/messages")}>
              <MessageCircle />
              我的消息
              <ChevronRight />
            </button>
            {user.role === "guide" && (
              <button onClick={() => navigate("/guide")}>
                <LayoutDashboard />
                档期、接单与收入
                <ChevronRight />
              </button>
            )}
            <button onClick={logout}>
              <LogOut />
              退出登录
              <ChevronRight />
            </button>
          </>
        )}
      </div>
      <InstallCard />
      <p className="small muted">
        旅游 · 商业 · 医疗 · 演唱会
        <br />
        服务时间均为韩国时间（UTC+9）。
      </p>
    </div>
  );
}
export function ConnectionNotice() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  return (
    !online && (
      <div className="offline-bar" role="status">
        <WifiOff size={16} />
        网络已断开，预约、支付及聊天需要联网。
      </div>
    )
  );
}
export function PaymentHandoff({ failed, navigate }) {
  const params = new URLSearchParams(location.search);
  params.delete("client");
  return (
    <div className="page narrow">
      <h1>返回 KoreaMate 完成支付核对</h1>
      <p>请返回 App，由服务器核对这笔付款。此页面不代表付款成功。</p>
      <a
        className="button"
        href={
          "koreamate://payments/" + (failed ? "fail" : "success") + "?" + params
        }
      >
        打开 KoreaMate App
      </a>
      <p>如果没有自动打开，请点击上面的按钮。</p>
      <button
        className="text-button"
        onClick={() =>
          window.location.assign(
            "/payments/" + (failed ? "fail" : "success") + "?" + params,
          )
        }
      >
        使用网页版继续
      </button>
    </div>
  );
}
