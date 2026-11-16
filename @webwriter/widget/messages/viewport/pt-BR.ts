import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "Visualização",
  zoomOut: "Diminuir o zoom",
  zoomIn: "Aumentar o zoom",
  percent: percent => `${percent}%`,
  reset: percent => `Zoom de ${percent}%. Redefinir para 100%`,
  fit: "Ajustar à visualização",
} satisfies Catalog<ViewportMessages>
