import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "გაუქმებულია.",
  notAllowed: "გაუქმებულია. ეს მოქმედება აქ აღარ არის დაშვებული.",
} satisfies Catalog<SharedMessages>
