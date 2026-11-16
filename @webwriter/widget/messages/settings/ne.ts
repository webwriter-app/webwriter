import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "यो मान यहाँ अनुमति छैन।",
  invalidDuration: "अवधि लेख्नुहोस्, जस्तै 1:30 वा 90।",
} satisfies Catalog<SettingsMessages>
