import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Tampilan",
  zoomOut: "Perkecil",
  zoomIn: "Perbesar",
  percent: percent => `${percent}%`,
  reset: percent => `Zoom ${percent}%. Atur ulang ke 100%`,
  fit: "Sesuaikan dengan tampilan",
} satisfies Catalog<ViewportMessages>
