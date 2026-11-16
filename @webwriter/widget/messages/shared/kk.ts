import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Бас тартылды.",
  notAllowed: "Бас тартылды. Бұған енді мұнда рұқсат жоқ.",
} satisfies Catalog<SharedMessages>
