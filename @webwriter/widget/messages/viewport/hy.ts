import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Դիտման տարածք",
  zoomOut: "Փոքրացնել",
  zoomIn: "Խոշորացնել",
  percent: percent => `${percent}%`,
  reset: percent => `Մասշտաբ՝ ${percent}%։ Վերադարձնել 100%-ի`,
  fit: "Տեղավորել դիտման տարածքում",
} satisfies Catalog<ViewportMessages>
