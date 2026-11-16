import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "보기 영역",
  zoomOut: "축소",
  zoomIn: "확대",
  percent: percent => `${percent}%`,
  reset: percent => `확대/축소 ${percent}%. 100%로 되돌리기`,
  fit: "화면에 맞추기",
} satisfies Catalog<ViewportMessages>
