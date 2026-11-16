import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "ਝਲਕ",
  zoomOut: "ਜ਼ੂਮ ਘਟਾਓ",
  zoomIn: "ਜ਼ੂਮ ਵਧਾਓ",
  percent: percent => `${percent}%`,
  reset: percent => `ਜ਼ੂਮ ${percent}%। 100% 'ਤੇ ਰੀਸੈੱਟ ਕਰੋ`,
  fit: "ਪੂਰਾ ਵਿਖਾਓ",
} satisfies Catalog<ViewportMessages>
