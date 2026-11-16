import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Selezione annullata." : count === 1 ? "1 elemento selezionato." : `Elementi selezionati: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Spostato." : `Elementi spostati: ${count}.`),
  notMoved: "Non spostato.",
  port: (port, node) => `${port} di ${node}`,
  linkPort: port => `Collega da ${port}`,
  wiring: (from, count) => (count === 1 ? `Filo da ${from}. 1 porta lo accetta. Le frecce scelgono, Invio collega, Esc annulla.` : `Filo da ${from}. Porte che lo accettano: ${count}. Le frecce scelgono, Invio collega, Esc annulla.`),
  target: (to, index, count) => `${to}, ${index} di ${count}.`,
  noTarget: "Nessuna porta accetta questo filo.",
  connected: (from, to) => `${from} collegato a ${to}.`,
  notConnected: "Non collegato.",
} satisfies Catalog<SceneMessages>
