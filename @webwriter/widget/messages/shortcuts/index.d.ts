/** The names of keys, as `labelsOf()` shows them where a key has no symbol. */
export type ShortcutsMessages = {
    control: string;
    alt: string;
    shift: string;
    meta: string;
    space: string;
    enter: string;
    escape: string;
    tab: string;
    backspace: string;
    delete: string;
    insert: string;
    home: string;
    end: string;
    pageUp: string;
    pageDown: string;
};
/** The key names of Shortcuts with their catalogs. */
export declare const shortcutsMessages: import("../../messages.js").MessageSource<ShortcutsMessages>;
