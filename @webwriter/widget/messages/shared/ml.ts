import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "റദ്ദാക്കി.",
  notAllowed: "റദ്ദാക്കി. ഇവിടെ ഇത് ഇനി അനുവദനീയമല്ല.",
} satisfies Catalog<SharedMessages>
