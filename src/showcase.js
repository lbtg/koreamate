// This module is imported only in the explicit showcase build, never in production.
const settings = {
  heroTitle: "与当地人一起，走进韩国",
  heroSubtitle: "按你的时间和目的，寻找合适的韩国地陪。",
  support: "平台客服",
  rules: "地陪确认后付款。此页面是界面预览，不接受真实预约。",
  faq: "所有时间均为韩国时间。预览人物为虚构示例。",
  commissionRate: 0.15,
  responseHours: 12,
  paymentMinutes: 30,
  bufferMinutes: 30,
  settlementHours: 24,
  paymentInstructions: "",
};
const guides = [
  {
    id: "sample-1",
    name: "金敏智 · 示例",
    city: "seoul",
    purposes: ["tourism", "concert"],
    bio: "一起逛首尔的街巷、咖啡馆与展览，也可以陪你规划演唱会当天的交通。此资料仅用于展示页面。",
    rate: 35000,
    style: "friendly",
  },
  {
    id: "sample-2",
    name: "朴俊宇 · 示例",
    city: "seoul",
    purposes: ["tourism", "business", "medical"],
    bio: "商务会面、城市探索与就诊陪同沟通。此为虚构示例，不代表实际服务资质。",
    rate: 45000,
    style: "professional",
  },
  {
    id: "sample-3",
    name: "李书妍 · 示例",
    city: "busan",
    purposes: ["tourism", "concert"],
    bio: "从海边散步到本地美食，体验釜山的一天。此资料仅用于展示页面。",
    rate: 30000,
    style: "quiet",
  },
].map((g) => ({
  ...g,
  isDemo: true,
  status: "approved",
  paused: false,
  capacity: 6,
  languages: "中文 · 한국어",
  chineseLevel: "fluent",
  image: "",
  reviewCount: 0,
  rating: 0,
  reviews: [],
  reviewNote: "演示资料，所有修改操作已关闭。",
}));
export async function showcaseApi(path, method) {
  if (method !== "GET")
    throw Error("正式账户服务尚未上线，当前不能注册、登录、预约或付款。");
  if (path === "/session")
    return {
      user: null,
      preview: true,
      settings,
      manualPayments: false,
      payments: { enabled: false },
    };
  if (path.startsWith("/guides?")) {
    const q = new URLSearchParams(path.split("?")[1]);
    return guides
      .filter(
        (g) =>
          g.city === q.get("city") &&
          (q.get("purposes") || "")
            .split(",")
            .every((p) => g.purposes.includes(p)) &&
          Number(q.get("adults")) + Number(q.get("children")) <= g.capacity &&
          (!q.get("budget") ||
            g.rate * Number(q.get("hours")) <= Number(q.get("budget"))) &&
          (!q.get("chinese") || q.get("chinese") === g.chineseLevel) &&
          (!q.get("style") || q.get("style") === g.style),
      )
      .map((g) => ({ ...g, total: g.rate * Number(q.get("hours")) }));
  }
  if (path.startsWith("/guides/"))
    return guides.find((g) => g.id === path.split("/")[2]);
  throw Error("请先登录；正式账户服务尚未上线。");
}
