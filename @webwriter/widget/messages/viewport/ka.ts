import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "ხედი",
  zoomOut: "შემცირება",
  zoomIn: "გადიდება",
  percent: percent => `${percent}%`,
  reset: percent => `მასშტაბი ${percent}%. დაბრუნება 100%-ზე`,
  fit: "ხედში ჩატევა",
} satisfies Catalog<ViewportMessages>
