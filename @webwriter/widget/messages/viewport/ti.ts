import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "ትርኢት",
  zoomOut: "ኣንእስ",
  zoomIn: "ኣግፍሕ",
  percent: percent => `${percent}%`,
  reset: percent => `ምግፋሕ ${percent}%። ናብ 100% መልስ`,
  fit: "ምስ ትርኢት ኣመሓይሽ",
} satisfies Catalog<ViewportMessages>
