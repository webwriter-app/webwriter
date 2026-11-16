import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "ទិដ្ឋភាព",
  zoomOut: "ពង្រួម",
  zoomIn: "ពង្រីក",
  percent: percent => `${percent}%`,
  reset: percent => `ពង្រីក ${percent}%។ កំណត់ឡើងវិញទៅ 100%`,
  fit: "ឱ្យសមនឹងទិដ្ឋភាព",
} satisfies Catalog<ViewportMessages>
