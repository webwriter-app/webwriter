import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "বাতিল করা হয়েছে।",
  notAllowed: "বাতিল করা হয়েছে। এখানে এটি আর অনুমোদিত নয়।",
} satisfies Catalog<SharedMessages>
