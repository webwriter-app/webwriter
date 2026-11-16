import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Auswiel opgehuewen." : count === 1 ? "1 Element ausgewielt." : `Ausgewielt Elementer: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Verschoben." : `Verschob Elementer: ${count}.`),
  notMoved: "Net verschoben.",
  port: (port, node) => `${port} vun ${node}`,
  linkPort: port => `Verbindung ufänken bei ${port}`,
  wiring: (from, count) => (count === 1 ? `Verbindung vun ${from}. 1 Ulaaf hëlt se un. D’Feiltasten wielen aus, Enter verbënnt, Esc brécht of.` : `Verbindung vun ${from}. Ulaaf, déi se unhuelen: ${count}. D’Feiltasten wielen aus, Enter verbënnt, Esc brécht of.`),
  target: (to, index, count) => `${to}, ${index} vun ${count}.`,
  noTarget: "Keen Ulaaf hëlt dës Verbindung un.",
  connected: (from, to) => `${from} mat ${to} verbonnen.`,
  notConnected: "Net verbonnen.",
} satisfies Catalog<SceneMessages>
