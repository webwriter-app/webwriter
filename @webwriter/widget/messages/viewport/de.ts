import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Ansicht",
  zoomOut: "Verkleinern",
  zoomIn: "Vergrößern",
  // With a no-break space, as German sets a percentage.
  percent: percent => `${percent}\u00a0%`,
  reset: percent => `Zoom ${percent}\u00a0%. Auf 100\u00a0% zurücksetzen`,
  fit: "Ganz anzeigen",
} satisfies Catalog<ViewportMessages>
