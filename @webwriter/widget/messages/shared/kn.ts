import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.",
  notAllowed: "ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ. ಇಲ್ಲಿ ಇದಕ್ಕೆ ಇನ್ನು ಅನುಮತಿ ಇಲ್ಲ.",
} satisfies Catalog<SharedMessages>
