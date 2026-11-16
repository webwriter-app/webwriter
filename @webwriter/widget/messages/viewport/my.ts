import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "မြင်ကွင်း",
  zoomOut: "ချုံ့ရန်",
  zoomIn: "ချဲ့ရန်",
  percent: percent => `${percent}%`,
  reset: percent => `ဇူးမ် ${percent}%။ 100% သို့ ပြန်လည်သတ်မှတ်ရန်`,
  fit: "မြင်ကွင်းနှင့် ကိုက်ညီစေရန်",
} satisfies Catalog<ViewportMessages>
