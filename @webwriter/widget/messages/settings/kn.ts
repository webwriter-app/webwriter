import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "ಈ ಮೌಲ್ಯ ಇಲ್ಲಿ ಅನುಮತಿಸಲಾಗಿಲ್ಲ.",
  invalidDuration: "ಅವಧಿಯನ್ನು ನಮೂದಿಸಿ, ಉದಾಹರಣೆಗೆ 1:30 ಅಥವಾ 90.",
} satisfies Catalog<SettingsMessages>
