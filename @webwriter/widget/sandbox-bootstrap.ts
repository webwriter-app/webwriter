/** Exact CSP-authorized bytes. Keep this a string: bundlers may rewrite functions.
 * scripts/build.mjs derives sandbox-policy.ts from it after compiling. */
export const sandboxBootstrapSource = String.raw`(async () => {
  // A hash is not scoped to an iframe. Never turn this into an execution
  // gadget in the editor, an ordinary same-origin frame, or a top-level file.
  if (window.parent === window || window.origin !== "null") return;
  try { void window.parent.document; return; } catch {}
  const payload = document.currentScript.previousElementSibling;
  if (!payload || payload.localName !== "script" || payload.type !== "application/json") return;
  const source = JSON.parse(payload.textContent);
  if (typeof source !== "string") return;
  const parsed = new DOMParser().parseFromString(source, "text/html");
  const scripts = Array.from(parsed.querySelectorAll("script"));
  const root = document.adoptNode(parsed.documentElement);
  document.replaceChild(root, document.documentElement);
  const classicTypes = new Set([
    "", "application/ecmascript", "application/javascript", "application/x-ecmascript", "application/x-javascript",
    "text/ecmascript", "text/javascript", "text/javascript1.0", "text/javascript1.1", "text/javascript1.2",
    "text/javascript1.3", "text/javascript1.4", "text/javascript1.5", "text/jscript", "text/livescript",
    "text/x-ecmascript", "text/x-javascript"
  ]);
  for (const original of scripts) {
    if (!original.isConnected || original.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
    const type = (original.getAttribute("type") || "").trim().toLowerCase();
    const module = type === "module";
    if (!module && !classicTypes.has(type)) continue;
    if (original.hasAttribute("nomodule") && !module) continue;
    const script = document.createElement("script");
    for (const attribute of original.attributes) {
      // Execution is authorized by strict-dynamic, never an editor nonce.
      if (attribute.name !== "nonce") script.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
    }
    // Inline modules do not reliably report completion through load. A data
    // module has an explicit completion/error event and stays server-free.
    if (module && !script.hasAttribute("src")) {
      script.src = "data:text/javascript;charset=utf-8," + encodeURIComponent(original.textContent);
    } else script.textContent = original.textContent;
    const wait = (module || script.hasAttribute("src")) && !script.hasAttribute("async");
    const loaded = wait ? new Promise(resolve => {
      script.addEventListener("load", resolve, {once: true});
      script.addEventListener("error", resolve, {once: true});
    }) : null;
    if (!script.hasAttribute("async")) script.async = false;
    original.replaceWith(script);
    if (loaded) await loaded;
  }
})();`
