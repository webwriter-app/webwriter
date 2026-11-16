/** The texts of Viewport. */
export type ViewportMessages = {
    /** Label of the window if the template gives it none. */
    viewport: string;
    /** Name of the zoom-out button. */
    zoomOut: string;
    /** Name of the zoom-in button. */
    zoomIn: string;
    /** What the percent button shows. */
    percent: (percent: number) => string;
    /** Name of the percent button, which returns to 100 %. */
    reset: (percent: number) => string;
    /** Name of the fit button. */
    fit: string;
};
/** The messages of Viewport with their catalogs. */
export declare const viewportMessages: import("../../messages.js").MessageSource<ViewportMessages>;
