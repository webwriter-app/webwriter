import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "ມຸມມອງ",
  zoomOut: "ຍ່ອ",
  zoomIn: "ຂະຫຍາຍ",
  percent: percent => `${percent}%`,
  reset: percent => `ຊູມ ${percent}%. ຣີເຊັດເປັນ 100%`,
  fit: "ພໍດີກັບມຸມມອງ",
} satisfies Catalog<ViewportMessages>
