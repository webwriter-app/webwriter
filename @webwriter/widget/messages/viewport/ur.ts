import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "منظر",
  zoomOut: "چھوٹا کریں",
  zoomIn: "بڑا کریں",
  percent: percent => `${percent}%`,
  reset: percent => `زوم ${percent}%۔ 100% پر ری سیٹ کریں`,
  fit: "منظر میں سمائیں",
} satisfies Catalog<ViewportMessages>
