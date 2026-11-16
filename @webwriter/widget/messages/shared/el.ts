import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Ακυρώθηκε.",
  notAllowed: "Ακυρώθηκε. Αυτό δεν επιτρέπεται πλέον εδώ.",
} satisfies Catalog<SharedMessages>
