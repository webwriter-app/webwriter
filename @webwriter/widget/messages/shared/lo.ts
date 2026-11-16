import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "ຍົກເລີກແລ້ວ.",
  notAllowed: "ຍົກເລີກແລ້ວ. ບໍ່ອະນຸຍາດໃຫ້ເຮັດສິ່ງນີ້ຢູ່ບ່ອນນີ້ອີກຕໍ່ໄປ.",
} satisfies Catalog<SharedMessages>
