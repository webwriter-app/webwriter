import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Selecția a fost anulată." : count === 1 ? "1 element selectat." : `Elemente selectate: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Mutat." : `Elemente mutate: ${count}.`),
  notMoved: "Nemutat.",
  port: (port, node) => `${port} – ${node}`,
  linkPort: port => `Conectează de la: ${port}`,
  wiring: (from, count) => (count === 1 ? `Fir de la: ${from}. Îl acceptă 1 port. Săgețile aleg, Enter conectează, Escape anulează.` : `Fir de la: ${from}. Porturi care îl acceptă: ${count}. Săgețile aleg, Enter conectează, Escape anulează.`),
  target: (to, index, count) => `${to}, ${index} din ${count}.`,
  noTarget: "Niciun port nu acceptă acest fir.",
  connected: (from, to) => `Conectat: ${from} cu ${to}.`,
  notConnected: "Neconectat.",
} satisfies Catalog<SceneMessages>
