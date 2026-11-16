import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "ຫຼິ້ນ",
  pause: "ຢຸດຊົ່ວຄາວ",
  step: "ໄປໜ້າໜຶ່ງຂັ້ນ",
  back: "ກັບຫຼັງໜຶ່ງຂັ້ນ",
  reset: "ຣີເຊັດ",
  seek: "ຕຳແໜ່ງ",
  rate: (_rate, shown) => `ຄວາມໄວ: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
