import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "این مقدار در اینجا مجاز نیست.",
  invalidDuration: "یک مدت زمان وارد کنید، مثلاً 1:30 یا 90.",
} satisfies Catalog<SettingsMessages>
