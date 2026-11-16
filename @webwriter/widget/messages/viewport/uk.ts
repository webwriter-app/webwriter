import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Область перегляду",
  zoomOut: "Зменшити",
  zoomIn: "Збільшити",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Масштаб ${percent}\u00a0%. Скинути до 100\u00a0%`,
  fit: "Умістити в області",
} satisfies Catalog<ViewportMessages>
