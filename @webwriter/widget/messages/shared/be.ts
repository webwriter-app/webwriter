import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Скасавана.",
  notAllowed: "Скасавана. Тут гэта больш не дазволена.",
} satisfies Catalog<SharedMessages>
