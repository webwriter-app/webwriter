import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "ވިއު",
  zoomOut: "ކުޑަކުރޭ",
  zoomIn: "ބޮޑުކުރޭ",
  percent: percent => `${percent}%`,
  reset: percent => `ޒޫމް ${percent}%. 100% އަށް ރީސެޓް ކުރޭ`,
  fit: "ވިއުއަށް ފިޓްކުރޭ",
} satisfies Catalog<ViewportMessages>
