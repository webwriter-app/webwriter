import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "Жокко чыгарылды.",
  notAllowed: "Жокко чыгарылды. Буга эми бул жерде уруксат жок.",
} satisfies Catalog<SharedMessages>
