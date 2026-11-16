/** A position or a vector. */
export type Point = {
    x: number;
    y: number;
};
/** A box in client coordinates. */
export type Box = {
    left: number;
    top: number;
    width: number;
    height: number;
};
/** The parent of an element in the tree that is rendered: its slot, its parent, or the host of its shadow root. */
export declare function flatParent(node: Element): Element | null;
/** `ancestor.contains(node)`, through shadow roots. */
export declare function composedContains(ancestor: Node, node: Node | null): boolean;
/** The centre of an element's box on the screen. For any affine transform this is where the centre of its own box lands. */
export declare function centreOf(element: Element): Point;
/** Applies the linear part of a matrix to a vector. */
export declare function apply(matrix: DOMMatrix, vector: Point): Point;
/**
 * The linear part of the map from an element's own pixels to the screen:
 * the CSS `zoom` and the transforms of the element and of everything around
 * it. With `own: false` the element's own transform is left out, which gives
 * the space its `translate` is measured in.
 */
export declare function screenMatrix(element: Element, own?: boolean): DOMMatrix;
/** The effective CSS `zoom` of an element: its own times that of everything around it. */
export declare function zoomOf(element: Element): number;
/** The surface of a point target as one item meets it. Made by `surfaceOf()`. */
export type Surface = {
    /** The point of the item's top-left corner, in the target's own coordinates, when its centre is at this place on the screen. */
    pointFor(centre: Point): Point;
    /** The place on the screen of the item's centre when its top-left corner is at this point. */
    centreFor(point: Point): Point;
    /** The nearest point on the grid that keeps the item on the surface. An axis named in `keep` is left as it is. */
    fit(point: Point, keep?: "x" | "y"): Point;
};
/**
 * The coordinate space of a point target: the one its absolutely positioned
 * children are placed in, with the origin at the top-left corner of its
 * padding box and its scroll position counted in. `extent` is the size of
 * the surface, `grid` the snap step (0 for none).
 *
 * Correct under CSS `zoom`, scaling, rotation and skewing of the target or of
 * anything around it, because only two facts are used: the centre of a box
 * stays its centre under an affine transform, and the linear part of that
 * transform is the product of the zooms and transforms on the way up.
 */
export declare function surfaceOf(target: HTMLElement, item: HTMLElement, extent: {
    width: number;
    height: number;
}, grid: number): Surface;
/** What a point target in world coordinates needs of a viewport: the two conversions. `ViewportCore` satisfies it. */
export type World = {
    toWorld(clientX: number, clientY: number): Point;
    toClient(worldX: number, worldY: number): Point;
};
/**
 * The surface of a point target that is the window of a canvas viewport: its
 * points are world coordinates. The item's top-left corner lands at the world
 * point that lies under the corner of the lifted item on the screen, so the
 * view's pan and zoom are counted in, and the item keeps its own size on the
 * screen while it is lifted. `grid` is the snap step in world units (0 for
 * none). The world has no edge: nothing is clamped.
 */
export declare function worldSurfaceOf(world: World, item: HTMLElement, grid: number): Surface;
/** How an index target lays out its items. */
export type Flow = {
    /** The items follow each other in rows. Otherwise they are stacked. */
    inline: boolean;
    /** Later items come first on the screen: right to left in a row, bottom to top in a stack. */
    reverse: boolean;
};
/**
 * The flow of an index target, read from the layout of its first two items:
 * side by side or stacked, and in which direction. With fewer items it is
 * read from the target's flex direction and writing direction.
 */
export declare function flowOf(target: Element, rects: readonly DOMRect[]): Flow;
/**
 * The index a point resolves to among laid-out items, from their midpoints.
 * Rows that wrap are told apart by where the items start over. `trailing`
 * says that the point is behind the last item of a row that is not the last.
 */
export declare function indexAt(flow: Flow, rects: readonly DOMRect[], x: number, y: number): {
    index: number;
    trailing: boolean;
};
/** The box of the drop marker for an index: a line in the gap between the two neighbours, across the flow. */
export declare function markerBox(flow: Flow, rects: readonly DOMRect[], index: number, trailing: boolean, empty: DOMRect, thickness?: number): Box;
