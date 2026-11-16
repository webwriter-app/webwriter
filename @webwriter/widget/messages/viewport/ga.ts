import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Amharc",
  zoomOut: "Súmáil amach",
  zoomIn: "Súmáil isteach",
  percent: percent => `${percent}%`,
  reset: percent => `Súmáil ${percent}%. Athshocraigh go 100%`,
  fit: "Oiriúnaigh don amharc",
} satisfies Catalog<ViewportMessages>
