# KoreaMate 手机 App

网站、PWA、Android 与 iOS 共用 `src/` 的全部业务页面、四类出行目的、原有图片与权限逻辑。手机底栏为发现（地陪为工作台）、预约、消息、我的。管理员仍使用独立 `/admin/login`；隐藏入口不代替服务端权限检查。

## 先体验桌面安装版

部署后的 HTTPS 网站包含 manifest、品牌图标和 service worker。手机打开网站，进入“我的 → 安装 / 添加到桌面”。iPhone 使用 Safari 分享菜单；Android 使用支持安装的浏览器。安装不会开通尚未配置的后台。离线仅显示提示，不缓存订单、会话、付款或用户 API，不提供离线预约。后台消息推送尚未接入；聊天在应用前台轮询。

## 原生工程

- `android/`：Capacitor 8 Android Studio 工程，应用 ID `com.koreamate.app`。
- `ios/`：Capacitor 8 Xcode / Swift Package Manager 工程，相同应用 ID。
- `capacitor.config.json`：打包本地网页资源，不用远程 `server.url` 替代打包。
- `src/mobile-runtime.js`：原生网络 cookie 会话、支付浏览器、支付回链和 Android 返回键。
- `src/mobile.jsx`：手机底栏、个人中心、安装说明及断网状态。

需要 Node 24+。Android 要求 Java 21 和 Android SDK 36；iOS 使用兼容 Capacitor 8 的 macOS / Xcode。正式产品发布前确认应用 ID 归属，并设置自己的签名身份。

```bash
npm ci
# 此值是公开网站/API网关的 HTTPS 根域名，不是含网关密钥的内部后台。
export VITE_API_ORIGIN=https://your-domain.example
npm run mobile:build
npm run mobile:sync
npm run mobile:android
# 在 macOS 上：npm run mobile:ios
```

预览版使用 `npm run mobile:preview`，仅在明确的 BACKEND_NOT_CONFIGURED 响应时显示示例资料。正式构建不包含该回退。原生构建缺少 HTTPS API 地址时会失败，防止发布不能连接服务的空壳。网站普通构建不需要该变量。

GitHub Actions 的 **Android preview APK** 工作流在本分支相关代码变更时生成调试安装包；进入工作流成功记录的 Artifacts 下载 KoreaMate-Android-preview。默认连接已有预览域名，可设置仓库变量 MOBILE_API_ORIGIN 改为稳定正式域名。调试包仅用于测试，不是商店发行包。调试签名可能随 CI 重建改变；正式发行须自行保管签名密钥。

## 登录与支付

原生 App 用 CapacitorHttp 连接同一 HTTPS 网关，cookie 由原生网络栈管理，CSRF 仍由服务器核验；不把密码或会话 cookie 写入 localStorage，也不放宽网页 CORS。客户端没有支付商户密钥或网关密钥。不同设备共用账户，登录会话各自独立。

App 结账通过系统浏览器打开 Toss，创建支付时带 `client=app`，回到 HTTPS `/payments/success?client=app` 后由用户点击打开 App。仅接收 `koreamate://payments/success` 和 `/fail` 回链，过滤参数；进入原有确认页后仍须验证当前账户、订单、金额和支付机构记录。回链本身不能证明付款成功。已在网站创建的支付链接可能沿用网页返回地址，应在网页完成确认或返回 App 核对订单。正式域名确定后建议改为已验证的 Universal Links / Android App Links。

## 当前交付状态与上线验证

工程与前端构建、服务端自动化测试可在当前环境完成；安装包编译结果以 CI 为准。当前未进行 iPhone/Android 真机登录、cookie 持久化、切后台/杀进程恢复、键盘避让和 Toss 银行/卡 App 跳转联调，不能声称商用就绪。

真实注册、预约、聊天、付款依赖 `deploy/README.md` 中的持久后台和商户配置；与网站共用，没有另建假后端。App Store / Google Play 尚未提交，iOS 需开发者签名 / TestFlight，Android 正式包需 release 签名。还需发布隐私政策、适用的账户注销流程、商店资料并完成渠道审核。付款目前为 Toss CARD/KRW；未启用微信/支付宝。后台推送、图片和语音聊天尚未实现，与网站当前边界一致。
