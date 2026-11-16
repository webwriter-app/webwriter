import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "દૃશ્ય",
  zoomOut: "ઝૂમ ઘટાડો",
  zoomIn: "ઝૂમ વધારો",
  percent: percent => `${percent}%`,
  reset: percent => `ઝૂમ ${percent}%. 100% પર રીસેટ કરો`,
  fit: "આખું બતાવો",
} satisfies Catalog<ViewportMessages>
