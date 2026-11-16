import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Այս արժեքն այստեղ թույլատրված չէ։",
  invalidDuration: "Մուտքագրեք տևողություն, օրինակ՝ 1:30 կամ 90։",
} satisfies Catalog<SettingsMessages>
