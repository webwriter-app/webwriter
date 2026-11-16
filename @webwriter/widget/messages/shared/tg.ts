import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Бекор карда шуд.",
  notAllowed: "Бекор карда шуд. Ин амал дигар дар ин ҷо иҷозат дода намешавад.",
} satisfies Catalog<SharedMessages>
