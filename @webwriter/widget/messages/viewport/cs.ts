import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Zobrazení",
  zoomOut: "Oddálit",
  zoomIn: "Přiblížit",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Přiblížení ${percent}\u00a0%. Obnovit na 100\u00a0%`,
  fit: "Přizpůsobit zobrazení",
} satisfies Catalog<ViewportMessages>
