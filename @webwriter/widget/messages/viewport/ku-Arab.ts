import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "دیمەن",
  zoomOut: "بچووک بکە",
  zoomIn: "مەزن بکە",
  percent: percent => `${percent}%`,
  reset: percent => `مەزنکرن ${percent}%. ڤەگێڕە 100%`,
  fit: "ل دیمەنی بگونجینە",
} satisfies Catalog<ViewportMessages>
