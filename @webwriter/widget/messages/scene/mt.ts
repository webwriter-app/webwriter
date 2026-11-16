import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "L-għażla tneħħiet." : count === 1 ? "1 element magħżul." : `Elementi magħżula: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Imċaqlaq." : `Elementi mċaqalqa: ${count}.`),
  notMoved: "Ma ċċaqlaqx.",
  port: (port, node) => `${port} ta' ${node}`,
  linkPort: port => `Qabbad minn ${port}`,
  wiring: (from, count) => (count === 1 ? `Wajer minn ${from}. Port 1 jaċċettah. Il-vleġeġ jagħżlu, Enter iqabbad, Escape jikkanċella.` : `Wajer minn ${from}. Portijiet li jaċċettawh: ${count}. Il-vleġeġ jagħżlu, Enter iqabbad, Escape jikkanċella.`),
  target: (to, index, count) => `${to}, ${index} minn ${count}.`,
  noTarget: "L-ebda port ma jaċċetta dan il-wajer.",
  connected: (from, to) => `Qabbadt ${from} ma' ${to}.`,
  notConnected: "Ma qabbadx.",
} satisfies Catalog<SceneMessages>
