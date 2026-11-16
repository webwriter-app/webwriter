import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Харагдац",
  zoomOut: "Жижигрүүлэх",
  zoomIn: "Томруулах",
  percent: percent => `${percent}%`,
  reset: percent => `Масштаб ${percent}%. 100% болгож сэргээх`,
  fit: "Харагдацад багтаах",
} satisfies Catalog<ViewportMessages>
