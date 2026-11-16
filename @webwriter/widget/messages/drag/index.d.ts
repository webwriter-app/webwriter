/** The texts Drag speaks. */
export type DragMessages = {
    /** Pick-up with the keyboard. */
    picked: (item: string) => string;
    /** Pick-up of a link with the keyboard. */
    pickedLink: (item: string) => string;
    /** Pick-up with a click. */
    selected: (item: string) => string;
    /** Added to the pick-up when arrow keys move the item inside a target and other targets exist. */
    nextTarget: string;
    /** A target, or a place in an index target: `position` is given then. */
    over: (target: string, position?: {
        index: number;
        count: number;
    }) => string;
    /** A point in a point target. */
    at: (target: string, x: number, y: number) => string;
    dropped: (item: string, target: string) => string;
    /** A drop with the `copy` effect. */
    copied: (item: string, target: string) => string;
    /** A drop with the `link` effect. */
    linked: (item: string, target: string) => string;
    cancelled: () => string;
    /** The interaction was ended because `can` turned false. */
    notAllowed: string;
};
/** The messages of Drag with their catalogs. */
export declare const dragMessages: import("../../messages.js").MessageSource<DragMessages>;
