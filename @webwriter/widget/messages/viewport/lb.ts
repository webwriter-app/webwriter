import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Usiicht",
  zoomOut: "Verklengeren",
  zoomIn: "Vergréisseren",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Zoom ${percent}\u00a0%. Op 100\u00a0% zrécksetzen`,
  fit: "Ganz uweisen",
} satisfies Catalog<ViewportMessages>
