import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Görnüş",
  zoomOut: "Kiçeltmek",
  zoomIn: "Ulaltmak",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Masştab ${percent}\u00a0%. 100\u00a0% -e gaýtar`,
  fit: "Görnüşe sygdyr",
} satisfies Catalog<ViewportMessages>
