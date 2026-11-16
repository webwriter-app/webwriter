import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "এই মান এখানে অনুমোদিত নয়।",
  invalidDuration: "একটি সময়কাল লিখুন, যেমন 1:30 বা 90।",
} satisfies Catalog<SettingsMessages>
