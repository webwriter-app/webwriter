import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Veduta",
  zoomOut: "Ċekken",
  zoomIn: "Kabbar",
  percent: percent => `${percent}%`,
  reset: percent => `Zoom ${percent}%. Erġa' għal 100%`,
  fit: "Adatta għall-veduta",
} satisfies Catalog<ViewportMessages>
