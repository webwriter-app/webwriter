import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "දසුන",
  zoomOut: "විශාලනය අඩු කරන්න",
  zoomIn: "විශාලනය වැඩි කරන්න",
  percent: percent => `${percent}%`,
  reset: percent => `විශාලනය ${percent}%. 100% වෙත යළි සකසන්න`,
  fit: "සියල්ල පෙන්වන්න",
} satisfies Catalog<ViewportMessages>
