import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Selección borrada." : count === 1 ? "1 elemento seleccionado." : `Elementos seleccionados: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Movido." : `Elementos movidos: ${count}.`),
  notMoved: "Non se moveu.",
  port: (port, node) => `${port} de ${node}`,
  linkPort: port => `Conectar desde ${port}`,
  wiring: (from, count) => (count === 1 ? `Cable desde ${from}. 1 porto acéptao. As frechas escollen, Intro conecta, Esc cancela.` : `Cable desde ${from}. Portos que o aceptan: ${count}. As frechas escollen, Intro conecta, Esc cancela.`),
  target: (to, index, count) => `${to}, ${index} de ${count}.`,
  noTarget: "Ningún porto acepta este cable.",
  connected: (from, to) => `${from} conectado con ${to}.`,
  notConnected: "Non conectado.",
} satisfies Catalog<SceneMessages>
