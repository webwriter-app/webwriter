import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "ተሰርዟል።",
  notAllowed: "ተሰርዟል። ይህ እዚህ ከአሁን በኋላ አይፈቀድም።",
} satisfies Catalog<SharedMessages>
