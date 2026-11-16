import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "ยกเลิกแล้ว",
  notAllowed: "ยกเลิกแล้ว ไม่อนุญาตให้ทำสิ่งนี้ที่นี่อีกต่อไป",
} satisfies Catalog<SharedMessages>
