/** What `announcer()` returns. */
export type Announcer = {
    /** Speaks `text` politely: it does not interrupt what is being read. */
    announce(text: string): void;
    /** Ends this use. The region is removed when its last user released it. Safe to call twice. */
    release(): void;
};
/**
 * The polite live region of a widget's shadow root, shared by every module in
 * it, so that a widget never speaks through two regions at once. In a core:
 *
 *     onConnect() {
 *         const live = announcer(this.root)
 *         this.cleanup(live.release)
 *         this.#announce = live.announce
 *     }
 *
 * The region is an empty `<div data-ww-live aria-live="polite">` at the end of
 * the shadow root. It exists from the first `announcer()` call, because a
 * region that appears together with its text is often not read.
 */
export declare function announcer(root: ShadowRoot): Announcer;
