import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Keuse is opgehef." : count === 1 ? "1 item gekies." : `${count} items gekies.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Verskuif." : `${count} items verskuif.`),
  notMoved: "Nie verskuif nie.",
  port: (port, node) => `${port} van ${node}`,
  linkPort: port => `Koppel vanaf ${port}`,
  wiring: (from, count) => (count === 1 ? `Verbinding vanaf ${from}. 1 poort aanvaar dit. Pyltjiesleutels kies, Enter koppel, Escape kanselleer.` : `Verbinding vanaf ${from}. ${count} poorte aanvaar dit. Pyltjiesleutels kies, Enter koppel, Escape kanselleer.`),
  target: (to, index, count) => `${to}, ${index} van ${count}.`,
  noTarget: "Geen poort aanvaar hierdie verbinding nie.",
  connected: (from, to) => `${from} is aan ${to} gekoppel.`,
  notConnected: "Nie gekoppel nie.",
} satisfies Catalog<SceneMessages>
