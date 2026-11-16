import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Tühistatud.",
  notAllowed: "Tühistatud. Siin pole see enam lubatud.",
} satisfies Catalog<SharedMessages>
