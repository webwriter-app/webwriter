import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "یہ قدر یہاں قابلِ قبول نہیں ہے۔",
  invalidDuration: "دورانیہ درج کریں، مثلاً 1:30 یا 90۔",
} satisfies Catalog<SettingsMessages>
