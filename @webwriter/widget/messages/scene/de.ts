import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Auswahl aufgehoben." : count === 1 ? "1 Element ausgewählt." : `${count} Elemente ausgewählt.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Verschoben." : `${count} Elemente verschoben.`),
  notMoved: "Nicht verschoben.",
  port: (port, node) => `${port} an ${node}`,
  linkPort: port => `Verbindung beginnen bei ${port}`,
  wiring: (from, count) =>
    `Verbindung von ${from}. ${count === 1 ? "1 Anschluss nimmt" : `${count} Anschlüsse nehmen`} sie an. Pfeiltasten wählen aus, Eingabetaste verbindet, Escape bricht ab.`,
  target: (to, index, count) => `${to}, ${index} von ${count}.`,
  noTarget: "Kein Anschluss nimmt diese Verbindung an.",
  connected: (from, to) => `${from} mit ${to} verbunden.`,
  notConnected: "Nicht verbunden.",
} satisfies Catalog<SceneMessages>
