import {defineMessages} from "../../messages.js"
import catalogs from "./catalogs.js"

/** What Scene speaks, and the names it gives to ports. The defaults are English. */
export type SceneMessages = {
  /** Spoken after the keyboard changed the selection. */
  selection: (count: number) => string
  /** Spoken for every step of a move by keyboard: where the focused item now is. */
  moving: (x: number, y: number) => string
  /** Spoken when a move by keyboard was committed. */
  moved: (count: number) => string
  /** Spoken when the widget refused a move. */
  notMoved: string
  /** How a port is named: its own name and the name of its node. */
  port: (port: string, node: string) => string
  /** Accessible name of a port a wire can start from, if the template gives it none. */
  linkPort: (port: string) => string
  /** Spoken when a wire is picked up by keyboard. */
  wiring: (from: string, count: number) => string
  /** Spoken for each port a wire is stepped to. */
  target: (to: string, index: number, count: number) => string
  /** Spoken when no port accepts the wire. */
  noTarget: string
  /** Spoken when the widget accepted a connection. */
  connected: (from: string, to: string) => string
  /** Spoken when the widget refused a connection. */
  notConnected: string
}

/** The messages of Scene with their catalogs. */
export const sceneMessages = defineMessages<SceneMessages>(
  {
    selection: count => (count === 0 ? "Selection cleared." : count === 1 ? "1 item selected." : `${count} items selected.`),
    moving: (x, y) => `x ${x}, y ${y}.`,
    moved: count => (count === 1 ? "Moved." : `${count} items moved.`),
    notMoved: "Not moved.",
    port: (port, node) => `${port} of ${node}`,
    linkPort: port => `Connect from ${port}`,
    wiring: (from, count) => `Wire from ${from}. ${count === 1 ? "1 port accepts" : `${count} ports accept`} it. Arrow keys choose, Enter connects, Escape cancels.`,
    target: (to, index, count) => `${to}, ${index} of ${count}.`,
    noTarget: "No port accepts this wire.",
    connected: (from, to) => `Connected ${from} to ${to}.`,
    notConnected: "Not connected.",
  },
  catalogs,
)
