import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Көрүнүш",
  zoomOut: "Кичирейтүү",
  zoomIn: "Чоңойтуу",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Масштаб ${percent}\u00a0%. 100\u00a0% кайтаруу`,
  fit: "Көрүнүшкө батыруу",
} satisfies Catalog<ViewportMessages>
