import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Намоиш",
  zoomOut: "Хурд кардан",
  zoomIn: "Калон кардан",
  percent: percent => `${percent}%`,
  reset: percent => `Миқёс ${percent}%. Бозгашт ба 100%`,
  fit: "Мувофиқ кардан ба намоиш",
} satisfies Catalog<ViewportMessages>
