/** What the print note says. The defaults are English. */
export type PrintMessages = {
    /** Printed in place of interactive content that has no print view. The address of the document follows it, if there is one. */
    note: string;
};
/** The print note's messages with their catalogs. */
export declare const printMessages: import("../../messages.js").MessageSource<PrintMessages>;
