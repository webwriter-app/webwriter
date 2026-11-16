/** What Scene speaks, and the names it gives to ports. The defaults are English. */
export type SceneMessages = {
    /** Spoken after the keyboard changed the selection. */
    selection: (count: number) => string;
    /** Spoken for every step of a move by keyboard: where the focused item now is. */
    moving: (x: number, y: number) => string;
    /** Spoken when a move by keyboard was committed. */
    moved: (count: number) => string;
    /** Spoken when the widget refused a move. */
    notMoved: string;
    /** How a port is named: its own name and the name of its node. */
    port: (port: string, node: string) => string;
    /** Accessible name of a port a wire can start from, if the template gives it none. */
    linkPort: (port: string) => string;
    /** Spoken when a wire is picked up by keyboard. */
    wiring: (from: string, count: number) => string;
    /** Spoken for each port a wire is stepped to. */
    target: (to: string, index: number, count: number) => string;
    /** Spoken when no port accepts the wire. */
    noTarget: string;
    /** Spoken when the widget accepted a connection. */
    connected: (from: string, to: string) => string;
    /** Spoken when the widget refused a connection. */
    notConnected: string;
};
/** The messages of Scene with their catalogs. */
export declare const sceneMessages: import("../../messages.js").MessageSource<SceneMessages>;
