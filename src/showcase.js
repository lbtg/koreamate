// This module is imported only in the explicit showcase build, never in production.
const settings = {
  heroTitle: "与当地人一起，走进韩国",
  heroSubtitle: "按你的时间和目的，寻找合适的韩国随行翻译。",
  support: "平台客服",
  rules: "随行翻译确认后付款。此页面是界面预览，不接受真实预约。",
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
    purposes: ["shopping", "concert"],
    bio: "商场、免税店的购物陪同翻译，以及演唱会、展览现场的陪同协助。此资料仅用于展示页面。",
    rate: 350,
    style: "friendly",
  },
  {
    id: "sample-2",
    name: "朴俊宇 · 示例",
    city: "seoul",
    purposes: ["business", "errands", "medical"],
    bio: "商务洽谈口译、行政手续陪同与就诊时的医患翻译。此为虚构示例，不代表实际服务资质。",
    rate: 450,
    style: "professional",
  },
  {
    id: "sample-3",
    name: "李书妍 · 示例",
    city: "busan",
    purposes: ["shopping", "errands"],
    bio: "釜山的购物陪同翻译与看房、开户等生活手续陪同。此资料仅用于展示页面。",
    rate: 300,
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
