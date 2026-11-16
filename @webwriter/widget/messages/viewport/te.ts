import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "వీక్షణం",
  zoomOut: "జూమ్ తగ్గించండి",
  zoomIn: "జూమ్ పెంచండి",
  percent: percent => `${percent}%`,
  reset: percent => `జూమ్ ${percent}%. 100% కు రీసెట్ చేయండి`,
  fit: "మొత్తం చూపండి",
} satisfies Catalog<ViewportMessages>
