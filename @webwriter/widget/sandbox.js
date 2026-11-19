import { sandboxBootstrapSource } from "./sandbox-bootstrap.js";
import { sandboxBootstrapSource as sandboxBootstrapSource2 } from "./sandbox-bootstrap.js";
import { sandboxScriptHash } from "./sandbox-policy.js";
function sandboxDocument(html) {
  const payload = JSON.stringify(html).replaceAll("<", "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="application/json">${payload}<\/script><script>${sandboxBootstrapSource}<\/script></body></html>`;
}
function renderSandbox(frame, html) {
  frame.setAttribute("sandbox", "allow-scripts");
  frame.removeAttribute("src");
  frame.srcdoc = sandboxDocument(html);
}
export {
  renderSandbox,
  sandboxBootstrapSource2 as sandboxBootstrapSource,
  sandboxDocument,
  sandboxScriptHash
};
