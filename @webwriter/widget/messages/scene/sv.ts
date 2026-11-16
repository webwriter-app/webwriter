import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Markeringen har tagits bort." : count === 1 ? "1 objekt valt." : `${count} objekt valda.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Flyttat." : `${count} objekt flyttade.`),
  notMoved: "Inte flyttat.",
  port: (port, node) => `${port} på ${node}`,
  linkPort: port => `Anslut från ${port}`,
  wiring: (from, count) => (count === 1 ? `Ledning från ${from}. 1 port godtar den. Piltangenterna väljer, Retur ansluter, Escape avbryter.` : `Ledning från ${from}. ${count} portar godtar den. Piltangenterna väljer, Retur ansluter, Escape avbryter.`),
  target: (to, index, count) => `${to}, ${index} av ${count}.`,
  noTarget: "Ingen port godtar den här ledningen.",
  connected: (from, to) => `Anslöt ${from} till ${to}.`,
  notConnected: "Inte ansluten.",
} satisfies Catalog<SceneMessages>
