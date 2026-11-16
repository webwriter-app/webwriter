import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "בוטל.",
  notAllowed: "בוטל. פעולה זו אינה מותרת עוד כאן.",
} satisfies Catalog<SharedMessages>
