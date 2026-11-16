import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Val fellt niður." : count === 1 ? "1 atriði valið." : `Valin atriði: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Fært." : `Færð atriði: ${count}.`),
  notMoved: "Ekki fært.",
  port: (port, node) => `${port} á ${node}`,
  linkPort: port => `Tengja frá ${port}`,
  wiring: (from, count) => (count === 1 ? `Tenging frá ${from}. 1 tengi tekur við henni. Örvatakkar velja, Enter tengir, Escape hættir við.` : `Tenging frá ${from}. Tengi sem taka við henni: ${count}. Örvatakkar velja, Enter tengir, Escape hættir við.`),
  target: (to, index, count) => `${to}, ${index} af ${count}.`,
  noTarget: "Ekkert tengi tekur við þessari tengingu.",
  connected: (from, to) => `Tengdi ${from} við ${to}.`,
  notConnected: "Ekki tengt.",
} satisfies Catalog<SceneMessages>
