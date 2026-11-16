import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "കാഴ്ച",
  zoomOut: "സൂം കുറയ്ക്കുക",
  zoomIn: "സൂം കൂട്ടുക",
  percent: percent => `${percent}%`,
  reset: percent => `സൂം ${percent}%. 100% ആയി പുനഃസജ്ജമാക്കുക`,
  fit: "മുഴുവൻ കാണിക്കുക",
} satisfies Catalog<ViewportMessages>
