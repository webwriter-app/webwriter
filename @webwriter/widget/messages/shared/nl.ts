import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Geannuleerd.",
  notAllowed: "Geannuleerd. Dit is hier niet meer toegestaan.",
} satisfies Catalog<SharedMessages>
