import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "ไม่อนุญาตให้ใช้ค่านี้ที่นี่",
  invalidDuration: "กรุณาป้อนระยะเวลา เช่น 1:30 หรือ 90",
} satisfies Catalog<SettingsMessages>
