import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "檢視",
  zoomOut: "縮小",
  zoomIn: "放大",
  percent: percent => `${percent}%`,
  reset: percent => `縮放 ${percent}%。重設為 100%`,
  fit: "符合檢視大小",
} satisfies Catalog<ViewportMessages>
