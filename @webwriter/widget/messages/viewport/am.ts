import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "እይታ",
  zoomOut: "አሳንስ",
  zoomIn: "አጉላ",
  percent: percent => `${percent}%`,
  reset: percent => `ማጉላት ${percent}%። ወደ 100% መልስ`,
  fit: "ከእይታ ጋር አስማማ",
} satisfies Catalog<ViewportMessages>
