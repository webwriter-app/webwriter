import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "આ મૂલ્ય અહીં માન્ય નથી.",
  invalidDuration: "સમયગાળો દાખલ કરો, જેમ કે 1:30 અથવા 90.",
} satisfies Catalog<SettingsMessages>
