import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Αυτή η τιμή δεν επιτρέπεται εδώ.",
  invalidDuration: "Εισαγάγετε μια διάρκεια, για παράδειγμα 1:30 ή 90.",
} satisfies Catalog<SettingsMessages>
