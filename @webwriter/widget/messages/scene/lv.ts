import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Atlase notīrīta." : count === 1 ? "Atlasīts 1 vienums." : `Atlasītie vienumi: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Pārvietots." : `Pārvietotie vienumi: ${count}.`),
  notMoved: "Nav pārvietots.",
  port: (port, node) => `${port} – ${node}`,
  linkPort: port => `Savienot no: ${port}`,
  wiring: (from, count) => (count === 1 ? `Vads no: ${from}. To pieņem 1 ports. Ar bultiņu taustiņiem izvēlieties, ar Enter savienojiet, ar Escape atceliet.` : `Vads no: ${from}. Porti, kas to pieņem: ${count}. Ar bultiņu taustiņiem izvēlieties, ar Enter savienojiet, ar Escape atceliet.`),
  target: (to, index, count) => `${to}, ${index} no ${count}.`,
  noTarget: "Neviens ports šo vadu nepieņem.",
  connected: (from, to) => `Savienots: ${from} un ${to}.`,
  notConnected: "Nav savienots.",
} satisfies Catalog<SceneMessages>
