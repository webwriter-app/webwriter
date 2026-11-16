import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "ビュー",
  zoomOut: "縮小",
  zoomIn: "拡大",
  percent: percent => `${percent}%`,
  reset: percent => `ズーム ${percent}%。100% に戻す`,
  fit: "表示に合わせる",
} satisfies Catalog<ViewportMessages>
