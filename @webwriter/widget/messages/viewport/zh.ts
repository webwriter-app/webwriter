import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "视图",
  zoomOut: "缩小",
  zoomIn: "放大",
  percent: percent => `${percent}%`,
  reset: percent => `缩放 ${percent}%。重置为 100%`,
  fit: "适应视图",
} satisfies Catalog<ViewportMessages>
