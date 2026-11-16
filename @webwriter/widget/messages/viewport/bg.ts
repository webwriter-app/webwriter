import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Изглед",
  zoomOut: "Намаляване",
  zoomIn: "Увеличаване",
  percent: percent => `${percent}%`,
  reset: percent => `Мащаб ${percent}%. Връщане на 100%`,
  fit: "Побиране в изгледа",
} satisfies Catalog<ViewportMessages>
