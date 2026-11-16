import type { Point } from "./geometry.js";
/** One measured port. */
export type Port = {
    /** `data-ww-port`. Empty for the node's centre, which a path without a port name attaches to. */
    name: string;
    /** The marked element. Null for the node's centre. */
    element: HTMLElement | null;
    /** The port's centre, relative to the node's top-left corner, in the node's own pixels. */
    at: Point;
    /** The direction a path leaves in: a unit vector, or zero for the centre. */
    side: Point;
};
/** The ports of one node, with the size the node had when they were measured. Empty while the node is not rendered. */
export type Ports = {
    readonly rendered: boolean;
    readonly width: number;
    readonly height: number;
    readonly list: readonly Port[];
    readonly byName: ReadonlyMap<string, Port>;
};
/**
 * The elements marked `data-ww-port` below `node`, in tree order. Open shadow
 * roots of nested components are searched too, and each one is reported to
 * `entered`, so that the caller can watch it for changes.
 */
export declare function portElements(node: Element, entered?: (root: ShadowRoot) => void): HTMLElement[];
/**
 * Measures where the ports of a node sit inside its box. The result does not
 * depend on where the node is or how the scene is zoomed, so it stays valid
 * until the node resizes or its content changes.
 *
 * A port faces the nearest edge of its node, unless it says otherwise with
 * `data-ww-side="left | right | top | bottom"`.
 */
export declare function measurePorts(node: HTMLElement, entered?: (root: ShadowRoot) => void): Ports;
