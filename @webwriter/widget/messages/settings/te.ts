import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "ఈ విలువ ఇక్కడ అనుమతించబడదు.",
  invalidDuration: "వ్యవధిని నమోదు చేయండి, ఉదాహరణకు 1:30 లేదా 90.",
} satisfies Catalog<SettingsMessages>
