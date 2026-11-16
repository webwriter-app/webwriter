import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "ບໍ່ອະນຸຍາດໃຫ້ໃຊ້ຄ່ານີ້ຢູ່ບ່ອນນີ້.",
  invalidDuration: "ກະລຸນາປ້ອນໄລຍະເວລາ, ຕົວຢ່າງ 1:30 ຫຼື 90.",
} satisfies Catalog<SettingsMessages>
