import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Izbor je preklican." : count === 1 ? "Izbran 1 element." : `Izbrani elementi: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Premaknjeno." : `Premaknjeni elementi: ${count}.`),
  notMoved: "Ni premaknjeno.",
  port: (port, node) => `${port} – ${node}`,
  linkPort: port => `Poveži iz: ${port}`,
  wiring: (from, count) => (count === 1 ? `Žica iz: ${from}. Sprejme jo 1 priključek. S puščičnimi tipkami izberite, s tipko Enter povežite, s tipko Escape prekličite.` : `Žica iz: ${from}. Priključki, ki jo sprejmejo: ${count}. S puščičnimi tipkami izberite, s tipko Enter povežite, s tipko Escape prekličite.`),
  target: (to, index, count) => `${to}, ${index} od ${count}.`,
  noTarget: "Nobeden priključek te žice ne sprejme.",
  connected: (from, to) => `Povezano: ${from} in ${to}.`,
  notConnected: "Ni povezano.",
} satisfies Catalog<SceneMessages>
