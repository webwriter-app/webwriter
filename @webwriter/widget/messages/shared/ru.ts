import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Отменено.",
  notAllowed: "Отменено. Здесь это больше не разрешено.",
} satisfies Catalog<SharedMessages>
