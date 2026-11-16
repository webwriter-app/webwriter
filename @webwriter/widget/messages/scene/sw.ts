import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Uteuzi umeondolewa." : count === 1 ? "Kipengee 1 kimechaguliwa." : `Vipengee vilivyochaguliwa: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Imehamishwa." : `Vipengee vilivyohamishwa: ${count}.`),
  notMoved: "Haikuhamishwa.",
  port: (port, node) => `${port} ya ${node}`,
  linkPort: port => `Unganisha kutoka ${port}`,
  wiring: (from, count) => (count === 1 ? `Waya kutoka ${from}. Mlango 1 unaikubali. Vitufe vya mshale huchagua, Enter huunganisha, Escape hughairi.` : `Waya kutoka ${from}. Milango inayoikubali: ${count}. Vitufe vya mshale huchagua, Enter huunganisha, Escape hughairi.`),
  target: (to, index, count) => `${to}, ${index} kati ya ${count}.`,
  noTarget: "Hakuna mlango unaokubali waya huu.",
  connected: (from, to) => `${from} imeunganishwa na ${to}.`,
  notConnected: "Haikuunganishwa.",
} satisfies Catalog<SceneMessages>
