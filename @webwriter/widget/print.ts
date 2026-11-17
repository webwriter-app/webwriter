import {ModuleCore, type CoreOptions} from "./base.js"
import {Messages, type MessagesOption} from "./messages.js"
import {printMessages, type PrintMessages} from "./messages/print/index.js"
import {adoptStyles, type AdoptedStyles} from "./styles.js"

export {printMessages, type PrintMessages} from "./messages/print/index.js"

/** Options of `PrintNoteCore`. */
export type PrintNoteOptions = CoreOptions & {
  /**
   * The address of the document that the note shows, where a reader finds the interactive version.
   * A function is asked on every render. `null` shows no address. By default `documentAddress()`.
   */
  address?: string | null | (() => string | null | undefined)
  /** Replaces texts of the module. */
  messages?: MessagesOption<PrintMessages>
}

/** The state of `PrintNoteCore`. */
export type PrintNoteSnapshot = {
  /** The note in the widget's language. */
  readonly text: string
  /** The address of the document, or null. */
  readonly address: string | null
}

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|.*\.localhost|.*\.test)$/

/**
 * Where the document can be opened online, if that is known: the address in the page's
 * `<link rel="canonical">`, else the address of the page itself if it is a public `http` or `https`
 * address (no loopback or `.test` host), without its fragment. Null otherwise: a document
 * that is open in the editor or from a file has no address to show.
 */
export function documentAddress(doc: Document = document): string | null {
  const canonical = doc.querySelector<HTMLLinkElement>('link[rel~="canonical" i][href]')?.href
  if(canonical && /^https?:/i.test(canonical)) return canonical
  try {
    const url = new URL(doc.location.href)
    if(!/^https?:$/.test(url.protocol) || LOOPBACK.test(url.hostname)) return null
    url.hash = ""
    return url.href
  } catch {
    return null
  }
}

// Shown on paper only. The class is the editor's print hook: it covers a print preview that sends no print media.
const css = `
[data-ww-print-note] { display: none; box-sizing: border-box; margin-block: 0.5em; padding: 0.5em 0.75em; border: 1px solid currentColor; font: 0.875em/1.4 system-ui, sans-serif; break-inside: avoid; overflow-wrap: anywhere; }
@media print { [data-ww-print-note] { display: block; } }
:host(.ww-beforeprint) [data-ww-print-note] { display: block; }
[data-ww-print-address] { display: block; margin-block-start: 0.25em; font-family: ui-monospace, monospace; }
`

/**
 * A short note that appears on paper only, for a widget that has no print view: the
 * interactive content is not shown, and the reader is told to open the document
 * online, with its address where known. The text is in the widget's language.
 *
 * The note is a `<p data-ww-print-note>`. The module fills one that the template has, so
 * the widget decides where it goes; without one it adds its own at the end of the shadow root.
 * It is hidden on screen, and shown for the `print` media and while the editor marks the widget
 * with the class `ww-beforeprint`.
 */
export class PrintNoteCore extends ModuleCore<PrintNoteSnapshot> {
  #messages: Messages<PrintMessages>
  #options: PrintNoteOptions
  #state: PrintNoteSnapshot = {text: "", address: null}
  #own: HTMLElement | null = null
  #written: {element: Element; key: string} | null = null
  #styles: AdoptedStyles | null = null

  constructor(host: HTMLElement, options: PrintNoteOptions = {}) {
    super(host, options)
    this.#options = options
    this.#messages = new Messages(host, printMessages, options.messages)
  }

  getSnapshot(): PrintNoteSnapshot {
    return this.#state
  }

  protected onConnect() {
    this.#styles = adoptStyles(this.root, css)
    this.cleanup(this.#styles)
    // The note is written again in the new language.
    this.cleanup(this.#messages.follow(() => this.refresh()))
    this.cleanup(() => {
      this.#own?.remove()
      this.#own = null
      this.#written = null
      this.#styles = null
      this.#state = {text: "", address: null}
    })
    this.onRefresh()
  }

  protected onRefresh() {
    const text = this.#messages.current.note
    const wanted = this.#options.address
    const address = (typeof wanted === "function" ? wanted() : wanted === undefined ? documentAddress(this.host.ownerDocument) : wanted) ?? null
    const root = this.root
    // A note of the template wins over the one the module adds at the end of the shadow root.
    const marked = [...root.querySelectorAll<HTMLElement>("[data-ww-print-note]")].find(candidate => candidate !== this.#own)
    let element: HTMLElement
    if(marked) {
      this.#own?.remove()
      this.#own = null
      element = marked
    } else {
      element = this.#own ??= root.ownerDocument.createElement("p")
      element.setAttribute("data-ww-print-note", "")
      // A framework may clear what a module added to the shadow root.
      if(element.parentNode !== root) root.append(element)
    }
    const key = `${text}\n${address ?? ""}`
    if(this.#written?.element !== element || this.#written.key !== key || !element.firstChild) {
      const lines: Node[] = [root.ownerDocument.createTextNode(text)]
      if(address) {
        const line = root.ownerDocument.createElement("span")
        line.setAttribute("data-ww-print-address", "")
        line.textContent = address
        lines.push(line)
      }
      element.replaceChildren(...lines)
      this.#written = {element, key}
    }
    if(text !== this.#state.text || address !== this.#state.address) {
      this.#state = {text, address}
      this.notify()
    }
  }
}
