import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `ຫຍິບ ${item} ແລ້ວ. ໃຊ້ປຸ່ມລູກສອນເພື່ອເລືອກຕຳແໜ່ງ, ກົດ Enter ເພື່ອວາງ, ກົດ Esc ເພື່ອຍົກເລີກ.`,
  pickedLink: item => `ກຳລັງເຊື່ອມ ${item}. ໃຊ້ປຸ່ມລູກສອນເພື່ອເລືອກປາຍທາງທີ່ຈະເຊື່ອມ, ກົດ Enter ເພື່ອເຊື່ອມ, ກົດ Esc ເພື່ອຍົກເລີກ.`,
  selected: item => `ເລືອກ ${item} ແລ້ວ. ຄລິກບ່ອນທີ່ຕ້ອງການວາງ ຫຼື ຄລິກອີກຄັ້ງເພື່ອຍົກເລີກ.`,
  nextTarget: "ກົດ Tab ເພື່ອໄປຫາເປົ້າໝາຍຖັດໄປ.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}ຕຳແໜ່ງທີ ${position.index} ຈາກ ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}ຫ່າງຈາກຊ້າຍ ${x}, ຫ່າງຈາກເທິງ ${y}`,
  dropped: (item, target) => (target ? `ວາງ ${item} ໃສ່ ${target} ແລ້ວ.` : `ວາງ ${item} ແລ້ວ.`),
  copied: (item, target) => (target ? `ເພີ່ມ ${item} ໃສ່ ${target} ແລ້ວ.` : `ເພີ່ມ ${item} ແລ້ວ.`),
  linked: (item, target) => `ເຊື່ອມ ${item} ກັບ ${target} ແລ້ວ.`,
  cancelled: () => "ຍົກເລີກແລ້ວ.",
  notAllowed: "ຍົກເລີກແລ້ວ. ບໍ່ອະນຸຍາດໃຫ້ເຮັດສິ່ງນີ້ຢູ່ບ່ອນນີ້ອີກຕໍ່ໄປ.",
} satisfies Catalog<DragMessages>
