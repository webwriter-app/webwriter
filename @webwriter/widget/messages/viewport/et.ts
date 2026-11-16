import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Vaade",
  zoomOut: "Vähenda",
  zoomIn: "Suurenda",
  percent: percent => `${percent}%`,
  reset: percent => `Suum ${percent}%. Lähtesta 100%-le`,
  fit: "Sobita vaatega",
} satisfies Catalog<ViewportMessages>
