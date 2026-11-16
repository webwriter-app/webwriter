import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Скасовано.",
  notAllowed: "Скасовано. Тут це більше не дозволено.",
} satisfies Catalog<SharedMessages>
