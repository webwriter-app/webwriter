import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "انتخاب برداشته شد." : count === 1 ? "یک مورد انتخاب شد." : `موارد انتخاب‌شده: ${count}.`),
  moving: (x, y) => `x ${x}، y ${y}.`,
  moved: count => (count === 1 ? "جابه‌جا شد." : `موارد جابه‌جاشده: ${count}.`),
  notMoved: "جابه‌جا نشد.",
  port: (port, node) => `${port} از ${node}`,
  linkPort: port => `اتصال از ${port}`,
  wiring: (from, count) => (count === 1 ? `اتصال از ${from}. یک درگاه آن را می‌پذیرد. با کلیدهای جهت‌دار انتخاب کنید، با Enter وصل کنید، با Escape لغو کنید.` : `اتصال از ${from}. درگاه‌هایی که آن را می‌پذیرند: ${count}. با کلیدهای جهت‌دار انتخاب کنید، با Enter وصل کنید، با Escape لغو کنید.`),
  target: (to, index, count) => `${to}، ${index} از ${count}.`,
  noTarget: "هیچ درگاهی این اتصال را نمی‌پذیرد.",
  connected: (from, to) => `${from} به ${to} وصل شد.`,
  notConnected: "وصل نشد.",
} satisfies Catalog<SceneMessages>
