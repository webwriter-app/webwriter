import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Ko‘rinish",
  zoomOut: "Kichraytirish",
  zoomIn: "Kattalashtirish",
  percent: percent => `${percent}%`,
  reset: percent => `Masshtab ${percent}%. 100%ga qaytarish`,
  fit: "Ko‘rinishga sig‘dirish",
} satisfies Catalog<ViewportMessages>
