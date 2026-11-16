import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Gekanselleer.",
  notAllowed: "Gekanselleer. Dit word nie meer hier toegelaat nie.",
} satisfies Catalog<SharedMessages>
