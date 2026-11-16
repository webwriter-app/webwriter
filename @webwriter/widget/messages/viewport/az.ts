import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Görünüş",
  zoomOut: "Uzaqlaşdır",
  zoomIn: "Yaxınlaşdır",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Miqyas ${percent}\u00a0%. 100\u00a0%-ə sıfırla`,
  fit: "Görünüşə sığışdır",
} satisfies Catalog<ViewportMessages>
