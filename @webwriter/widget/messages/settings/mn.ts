import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Энэ утга энд зөвшөөрөгдөхгүй.",
  invalidDuration: "Үргэлжлэх хугацааг оруулна уу, жишээ нь 1:30 эсвэл 90.",
} satisfies Catalog<SettingsMessages>
