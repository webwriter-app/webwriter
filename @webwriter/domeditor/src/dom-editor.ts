import { LitElement, css, html } from "lit"
import type { AppRibbon } from "./ribbon"
import type { EditingAction } from "./domeditor"
import { slashMenuItems } from "./slash-menu"
import {
  executeCompleteEvent,
  executeFailureEvent,
  isExecuteResponse,
  type ExecuteCompleteDetail,
  type ExecuteFailureDetail,
} from "./editor-bridge"
import "./ribbon"

const escapeAttribute = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("\"", "&quot;")
  .replaceAll("<", "&lt;")

const editorEntryUrl = `${import.meta.env.BASE_URL}${import.meta.env.DEV ? "src/editor-entry.ts" : "assets/editor-entry.js"}`
const appIconUrl = `${import.meta.env.BASE_URL}assets/app-icon-transparent.svg`

/** The iframe-backed editor element. The iframe gets its own document and
 * runs the editor module there, keeping editor styles, selection and DOM
 * mutations isolated from the host document. */
export class DomEditor extends LitElement {
  private editorDocument: Document | null = null
  private editorWindow: Window | null = null
  private editorReadyPromise: Promise<Window> | null = null
  private editorReadyResolve: ((editorWindow: Window) => void) | null = null
  private editorReadyReject: ((reason: unknown) => void) | null = null
  private requestSequence = 0
  private pendingExecutions = new Map<string, {
    resolve: (value: unknown) => void
    reject: (reason?: unknown) => void
  }>()

  static styles = css`
    :host {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      border: 0.5px solid #a8a8a8;
    }

    .app-bar {
      flex: 0 0 auto;
      width: 100%;
    }

    iframe {
      display: block;
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
      border: 0;
    }
  `

  private get editorSrcdoc() {
    return `<script type="module" src="${escapeAttribute(editorEntryUrl)}"></script>`
  }

  private handleEditorFrameLoad = (event: Event) => {
    this.editorDocument?.removeEventListener("pointerdown", this.handleEditorPointerDown)
    const iframe = event.currentTarget as HTMLIFrameElement
    this.editorDocument = iframe.contentDocument
    this.editorWindow = iframe.contentWindow
    this.editorDocument?.addEventListener("pointerdown", this.handleEditorPointerDown)
    if(this.editorWindow) {
      this.editorReadyResolve?.(this.editorWindow)
    }
    else {
      this.editorReadyReject?.(new Error("The DOM editor iframe has no content window"))
    }
    this.editorReadyResolve = null
    this.editorReadyReject = null
  }

  private handleEditorPointerDown = () => {
    this.renderRoot.querySelector<AppRibbon>("app-ribbon")?.dismissCollapsedMenu()
  }

  private handleRibbonButtonClick = (event: Event) => {
    const label = (event as CustomEvent<{label?: string}>).detail?.label
    const item = slashMenuItems.find(candidate => candidate.name === label)
    if(!item) return

    void this.execute({
      type: "insert",
      html: `<${item.tag}></${item.tag}>`,
    })
  }

  private handleEditorMessage = (event: MessageEvent) => {
    if(!isExecuteResponse(event.data)) return
    if(event.source && event.source !== this.editorWindow) return

    const detail = event.data.detail
    const pending = this.pendingExecutions.get(detail.requestId)
    if(!pending) return
    this.pendingExecutions.delete(detail.requestId)

    this.dispatchEvent(new CustomEvent(event.data.type, {
      detail,
      bubbles: true,
      composed: true,
    }))
    if(event.data.type === executeCompleteEvent) {
      pending.resolve((detail as ExecuteCompleteDetail).result)
    }
    else {
      pending.reject(this.deserializeError((detail as ExecuteFailureDetail).error))
    }
  }

  private waitForEditorWindow() {
    if(this.editorWindow) return Promise.resolve(this.editorWindow)
    if(!this.editorReadyPromise) {
      this.editorReadyPromise = new Promise<Window>((resolve, reject) => {
        this.editorReadyResolve = resolve
        this.editorReadyReject = reject
      })
    }
    return this.editorReadyPromise
  }

  private deserializeError(error: unknown) {
    if(error instanceof Error) return error
    if(error && typeof error === "object") {
      const serialized = error as {name?: unknown, message?: unknown, stack?: unknown}
      const deserialized = new Error(String(serialized.message ?? error))
      if(typeof serialized.name === "string") deserialized.name = serialized.name
      if(typeof serialized.stack === "string") deserialized.stack = serialized.stack
      return deserialized
    }
    return error
  }

  async execute(action: EditingAction): Promise<unknown> {
    if(!this.isConnected) {
      throw new Error("The DOM editor component is not connected")
    }
    const requestId = String(++this.requestSequence)
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pendingExecutions.set(requestId, {resolve, reject})
    })

    try {
      const editorWindow = await this.waitForEditorWindow()
      editorWindow.postMessage(Object.assign({}, action as object, {requestId}), "*")
    }
    catch(error) {
      const pending = this.pendingExecutions.get(requestId)
      if(pending) {
        this.pendingExecutions.delete(requestId)
        pending.reject(error)
      }
    }

    return promise
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener("message", this.handleEditorMessage)
  }

  disconnectedCallback() {
    window.removeEventListener("message", this.handleEditorMessage)
    this.editorDocument?.removeEventListener("pointerdown", this.handleEditorPointerDown)
    this.editorDocument = null
    this.editorWindow = null
    this.editorReadyReject?.(new Error("The DOM editor component was disconnected"))
    this.editorReadyPromise = null
    this.editorReadyResolve = null
    this.editorReadyReject = null
    const error = new Error("The DOM editor component was disconnected")
    this.pendingExecutions.forEach(({reject}) => reject(error))
    this.pendingExecutions.clear()
    super.disconnectedCallback()
  }

  render() {
    return html`
      <header class="app-bar">
        <app-ribbon
          logo-url=${appIconUrl}
          @ribbon-button-click=${this.handleRibbonButtonClick}
        ></app-ribbon>
      </header>
      <iframe title="DOM editor" srcdoc=${this.editorSrcdoc} @load=${this.handleEditorFrameLoad}></iframe>
    `
  }
}

if(!customElements.get("dom-editor")) {
  customElements.define("dom-editor", DomEditor)
}

declare global {
  interface HTMLElementTagNameMap {
    "dom-editor": DomEditor
  }
}
