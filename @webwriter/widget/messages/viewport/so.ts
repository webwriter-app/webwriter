import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Muuqaal",
  zoomOut: "Yaree",
  zoomIn: "Weyneey",
  percent: percent => `${percent}%`,
  reset: percent => `Weyneyn ${percent}%. Ku celi 100%`,
  fit: "U habee muuqaalka",
} satisfies Catalog<ViewportMessages>
