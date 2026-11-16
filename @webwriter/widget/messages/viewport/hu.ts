import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Nézet",
  zoomOut: "Kicsinyítés",
  zoomIn: "Nagyítás",
  percent: percent => `${percent}%`,
  reset: percent => `Nagyítás: ${percent}%. Visszaállítás 100%-ra`,
  fit: "Igazítás a nézethez",
} satisfies Catalog<ViewportMessages>
