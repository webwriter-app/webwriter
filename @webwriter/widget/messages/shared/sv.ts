import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Avbrutet.",
  notAllowed: "Avbrutet. Det här är inte längre tillåtet här.",
} satisfies Catalog<SharedMessages>
