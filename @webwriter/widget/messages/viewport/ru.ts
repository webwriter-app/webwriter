import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Область просмотра",
  zoomOut: "Уменьшить",
  zoomIn: "Увеличить",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Масштаб ${percent}\u00a0%. Сбросить до 100\u00a0%`,
  fit: "Вписать в область",
} satisfies Catalog<ViewportMessages>
