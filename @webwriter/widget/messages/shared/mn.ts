import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Болиулсан.",
  notAllowed: "Болиулсан. Энд үүнийг хийхийг больж зөвшөөрөхгүй.",
} satisfies Catalog<SharedMessages>
