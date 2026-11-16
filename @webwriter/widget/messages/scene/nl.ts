import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Selectie opgeheven." : count === 1 ? "1 item geselecteerd." : `${count} items geselecteerd.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Verplaatst." : `${count} items verplaatst.`),
  notMoved: "Niet verplaatst.",
  port: (port, node) => `${port} van ${node}`,
  linkPort: port => `Verbinden vanaf ${port}`,
  wiring: (from, count) => (count === 1 ? `Verbinding vanaf ${from}. 1 poort accepteert deze. Pijltoetsen kiezen, Enter verbindt, Escape annuleert.` : `Verbinding vanaf ${from}. ${count} poorten accepteren deze. Pijltoetsen kiezen, Enter verbindt, Escape annuleert.`),
  target: (to, index, count) => `${to}, ${index} van ${count}.`,
  noTarget: "Geen enkele poort accepteert deze verbinding.",
  connected: (from, to) => `${from} verbonden met ${to}.`,
  notConnected: "Niet verbonden.",
} satisfies Catalog<SceneMessages>
