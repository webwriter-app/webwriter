import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "ეს მნიშვნელობა აქ დაშვებული არ არის.",
  invalidDuration: "შეიყვანეთ ხანგრძლივობა, მაგალითად, 1:30 ან 90.",
} satisfies Catalog<SettingsMessages>
