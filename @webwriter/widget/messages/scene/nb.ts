import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Valg opphevet." : count === 1 ? "1 element valgt." : `${count} elementer valgt.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Flyttet." : `${count} elementer flyttet.`),
  notMoved: "Ikke flyttet.",
  port: (port, node) => `${port} på ${node}`,
  linkPort: port => `Koble fra ${port}`,
  wiring: (from, count) => (count === 1 ? `Kobling fra ${from}. 1 port godtar den. Piltaster velger, Enter kobler, Escape avbryter.` : `Kobling fra ${from}. ${count} porter godtar den. Piltaster velger, Enter kobler, Escape avbryter.`),
  target: (to, index, count) => `${to}, ${index} av ${count}.`,
  noTarget: "Ingen port godtar denne koblingen.",
  connected: (from, to) => `Koblet ${from} til ${to}.`,
  notConnected: "Ikke koblet.",
} satisfies Catalog<SceneMessages>
