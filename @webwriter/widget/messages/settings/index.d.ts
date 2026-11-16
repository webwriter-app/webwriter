/** The texts of Settings: what a bound control reports for an entry it does not take. */
export type SettingsMessages = {
    /** For a value that is outside the choices or does not fit `pattern`, `minlength` or `maxlength`. */
    invalid: string;
    /** For a text that is not a duration. */
    invalidDuration: string;
};
/** The messages of Settings with their catalogs. */
export declare const settingsMessages: import("../../messages.js").MessageSource<SettingsMessages>;
