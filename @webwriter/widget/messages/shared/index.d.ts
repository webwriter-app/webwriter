/** Texts that several modules speak. */
export type SharedMessages = {
    /** Spoken when an interaction ends without a change. */
    cancelled: string;
    /** Spoken when a running interaction is cancelled because the reader may no longer do it. */
    notAllowed: string;
};
/** The shared messages with their catalogs. A module adds them to its own table or reads them through `Messages`. */
export declare const sharedMessages: import("../../messages.js").MessageSource<SharedMessages>;
