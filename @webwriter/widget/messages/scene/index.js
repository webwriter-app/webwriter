import { defineMessages } from "../../messages.js";
import catalogs from "./catalogs.js";
const sceneMessages = defineMessages(
  {
    selection: (count) => count === 0 ? "Selection cleared." : count === 1 ? "1 item selected." : `${count} items selected.`,
    moving: (x, y) => `x ${x}, y ${y}.`,
    moved: (count) => count === 1 ? "Moved." : `${count} items moved.`,
    notMoved: "Not moved.",
    port: (port, node) => `${port} of ${node}`,
    linkPort: (port) => `Connect from ${port}`,
    wiring: (from, count) => `Wire from ${from}. ${count === 1 ? "1 port accepts" : `${count} ports accept`} it. Arrow keys choose, Enter connects, Escape cancels.`,
    target: (to, index, count) => `${to}, ${index} of ${count}.`,
    noTarget: "No port accepts this wire.",
    connected: (from, to) => `Connected ${from} to ${to}.`,
    notConnected: "Not connected."
  },
  catalogs
);
export {
  sceneMessages
};
