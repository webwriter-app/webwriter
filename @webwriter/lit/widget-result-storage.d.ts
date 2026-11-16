export type WidgetResultType = "application/json" | "application/xml";
export type WidgetResult = {
    type: WidgetResultType;
    text: string;
};
export type StoredWidgetResult = WidgetResult & {
    revision: string;
};
export interface WidgetResultStorage {
    load(signal: AbortSignal): Promise<StoredWidgetResult | null>;
    save(result: WidgetResult, revision: string | null, signal: AbortSignal): Promise<string>;
}
export declare class WidgetResultConflict extends Error {
    constructor();
}
export declare function isWidgetResultType(type: unknown): type is WidgetResultType;
export declare function validateWidgetResult(result: WidgetResult): void;
export declare class BrowserWidgetResultStorage implements WidgetResultStorage {
    private storage;
    private key;
    constructor(storage: Storage, key: string);
    load(signal: AbortSignal): Promise<{
        type: WidgetResultType;
        text: string;
        revision: string;
    } | null>;
    save(result: WidgetResult, revision: string | null, signal: AbortSignal): Promise<string>;
}
export declare function widgetResultEndpoint(input: string, base: string): URL;
export declare class HttpWidgetResultStorage implements WidgetResultStorage {
    private request;
    private readonly endpoint;
    constructor(endpoint: URL, request?: typeof fetch);
    private fetch;
    load(signal: AbortSignal): Promise<{
        type: WidgetResultType;
        text: string;
        revision: string;
    } | null>;
    save(result: WidgetResult, revision: string | null, signal: AbortSignal): Promise<string>;
}
/** A unique authored ID survives reordering. Idless embeds use their DOM position. */
export declare function widgetResultKey(widget: Element): string;
