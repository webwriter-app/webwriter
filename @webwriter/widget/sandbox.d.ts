export { sandboxBootstrapSource } from "./sandbox-bootstrap.js";
export { sandboxScriptHash } from "./sandbox-policy.js";
/** A self-contained HTML execution document for an opaque script sandbox.
 * Hosts with CSP must authorize sandboxScriptHash and use strict-dynamic.
 * The bootstrap refuses to execute outside an isolated opaque iframe.
 * This activates classic/module scripts, not inline event attributes or
 * document.write. Resources remain subject to the inherited CSP and CORS. */
export declare function sandboxDocument(html: string): string;
/** Replace an iframe's execution realm. Call on a new/detached iframe when
 * possible: sandbox permissions take effect at navigation, not retroactively.
 * No object URLs or host listeners are retained; the caller owns the frame. */
export declare function renderSandbox(frame: HTMLIFrameElement, html: string): void;
