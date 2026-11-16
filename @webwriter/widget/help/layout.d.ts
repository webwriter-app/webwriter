/** A rectangle in the coordinates of the overlay. */
export type Box = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};
/** A side of an element. */
export type Side = "top" | "right" | "bottom" | "left";
/** The corner points of a connector, from the element to the label. */
export type Line = [number, number][];
/** One label to place. */
export type LabelItem = {
    /** The marked element. */
    target: Box;
    /** Size of its label. */
    width: number;
    height: number;
    /** Sides to try, in order. */
    sides: Side[];
    /** A large element: the label goes inside it. */
    region: boolean;
    /** Where CSS anchor positioning put the label, if it is in use. */
    css?: Box;
};
/** Where a label goes. */
export type LabelPlacement = {
    box: Box;
    /** Corner points of the connector, or null for a label that sits next to or inside its element. */
    line: Line | null;
    /** The position CSS chose was kept. */
    css: boolean;
};
/**
 * The connector from an element to its label: none if the label touches or
 * overlaps the element, a straight line if the two are aligned, otherwise a
 * right-angled line that leaves the element upwards or downwards and turns
 * towards the label.
 */
export declare function connector(box: Box, target: Box): Line | null;
/**
 * Places every label, or returns null if they do not all fit. A label never
 * covers another label, a connector or another marked element, except regions
 * and the elements around or inside its own. Connectors do not cross.
 *
 * 1. A label stays next to its element where that is free.
 * 2. Elements in a row whose labels would cover each other get a staircase
 *    below or above the row: every label on a line of its own, hooked on a
 *    straight connector, ordered so that no connector crosses a label. The
 *    labels reach towards the side that has room. In a row with no room on
 *    either side they fan out to both: the labels of the left part reach
 *    left, those of the right part reach right, and connectors that have to
 *    make way first run sideways just beyond the row.
 * 3. Elements in a column whose labels would cover each other get a stack
 *    beside the column, in the same order, each label joined to its element
 *    by a connector that steps out sideways.
 * 4. Any other label that is not free moves farther out, with a connector.
 *
 * The labels are placed in the order given. If one of them finds no place,
 * the ones placed before it try their next position.
 */
export declare function layoutLabels(bounds: Box, items: LabelItem[], avoid?: Box[]): LabelPlacement[] | null;
