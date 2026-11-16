import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "视图",
  zoomOut: "缩细",
  zoomIn: "放大",
  percent: percent => `${percent}%`,
  reset: percent => `缩放 ${percent}%。重设为 100%`,
  fit: "配合视图大小",
} satisfies Catalog<ViewportMessages>
