import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Вобласць прагляду",
  zoomOut: "Паменшыць",
  zoomIn: "Павялічыць",
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Маштаб ${percent}\u00a0%. Скінуць да 100\u00a0%`,
  fit: "Умясціць у вобласці",
} satisfies Catalog<ViewportMessages>
