import { ModuleCore } from "./base.js";
import { Messages } from "./messages.js";
import { printMessages } from "./messages/print/index.js";
import { adoptStyles } from "./styles.js";
import { printMessages as printMessages2 } from "./messages/print/index.js";
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|.*\.localhost|.*\.test)$/;
function documentAddress(doc = document) {
  const canonical = doc.querySelector('link[rel~="canonical" i][href]')?.href;
  if (canonical && /^https?:/i.test(canonical)) return canonical;
  try {
    const url = new URL(doc.location.href);
    if (!/^https?:$/.test(url.protocol) || LOOPBACK.test(url.hostname)) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
const css = `
[data-ww-print-note] { display: none; box-sizing: border-box; margin-block: 0.5em; padding: 0.5em 0.75em; border: 1px solid currentColor; font: 0.875em/1.4 system-ui, sans-serif; break-inside: avoid; overflow-wrap: anywhere; }
@media print { [data-ww-print-note] { display: block; } }
:host(.ww-beforeprint) [data-ww-print-note] { display: block; }
[data-ww-print-address] { display: block; margin-block-start: 0.25em; font-family: ui-monospace, monospace; }
`;
class PrintNoteCore extends ModuleCore {
  #messages;
  #options;
  #state = { text: "", address: null };
  #own = null;
  #written = null;
  #styles = null;
  constructor(host, options = {}) {
    super(host, options);
    this.#options = options;
    this.#messages = new Messages(host, printMessages, options.messages);
  }
  getSnapshot() {
    return this.#state;
  }
  onConnect() {
    this.#styles = adoptStyles(this.root, css);
    this.cleanup(this.#styles);
    this.cleanup(this.#messages.follow(() => this.refresh()));
    this.cleanup(() => {
      this.#own?.remove();
      this.#own = null;
      this.#written = null;
      this.#styles = null;
      this.#state = { text: "", address: null };
    });
    this.onRefresh();
  }
  onRefresh() {
    const text = this.#messages.current.note;
    const wanted = this.#options.address;
    const address = (typeof wanted === "function" ? wanted() : wanted === void 0 ? documentAddress(this.host.ownerDocument) : wanted) ?? null;
    const root = this.root;
    const marked = [...root.querySelectorAll("[data-ww-print-note]")].find((candidate) => candidate !== this.#own);
    let element;
    if (marked) {
      this.#own?.remove();
      this.#own = null;
      element = marked;
    } else {
      element = this.#own ??= root.ownerDocument.createElement("p");
      element.setAttribute("data-ww-print-note", "");
      if (element.parentNode !== root) root.append(element);
    }
    const key = `${text}
${address ?? ""}`;
    if (this.#written?.element !== element || this.#written.key !== key || !element.firstChild) {
      const lines = [root.ownerDocument.createTextNode(text)];
      if (address) {
        const line = root.ownerDocument.createElement("span");
        line.setAttribute("data-ww-print-address", "");
        line.textContent = address;
        lines.push(line);
      }
      element.replaceChildren(...lines);
      this.#written = { element, key };
    }
    if (text !== this.#state.text || address !== this.#state.address) {
      this.#state = { text, address };
      this.notify();
    }
  }
}
export {
  PrintNoteCore,
  documentAddress,
  printMessages2 as printMessages
};
