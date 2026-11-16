import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "இந்த மதிப்பு இங்கே அனுமதிக்கப்படாது.",
  invalidDuration: "கால அளவை உள்ளிடவும், எடுத்துக்காட்டாக 1:30 அல்லது 90.",
} satisfies Catalog<SettingsMessages>
