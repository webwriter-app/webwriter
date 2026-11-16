import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "காட்சி",
  zoomOut: "சிறிதாக்கவும்",
  zoomIn: "பெரிதாக்கவும்",
  percent: percent => `${percent}%`,
  reset: percent => `பெரிதாக்கம் ${percent}%. 100% ஆக மீட்டமைக்கவும்`,
  fit: "முழுவதையும் காட்டவும்",
} satisfies Catalog<ViewportMessages>
