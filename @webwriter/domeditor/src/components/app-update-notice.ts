import {LitElement, css, html, nothing} from "lit"
import appVersion from "virtual:app-version"
import {ribbonIcon} from "../ribbon-icons"
import {fixedPopupPosition} from "./popup-position"

/** Application UI only; checking for a deployment never reloads an open document. */
export class AppUpdateNotice extends LitElement {
  static properties = {anchor: {attribute: false}, availableVersion: {state: true}}
  static styles = css`
    :host {
      position: fixed;
      z-index: 9;
      display: block;
      box-sizing: border-box;
      width: min(22rem, calc(100vw - 1rem));
      border: 1px solid #b9c5d2;
      border-radius: .45rem;
      background: #fff;
      box-shadow: 0 3px 14px rgb(32 42 54 / 12%);
      color: #2f3742;
      font: .75rem/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    :host([hidden]) { display: none; }
    :host::before {
      content: "";
      position: absolute;
      top: -6px;
      left: var(--tip-left, 16px);
      width: 10px;
      height: 10px;
      border-top: 1px solid #b9c5d2;
      border-left: 1px solid #b9c5d2;
      background: #fff;
      transform: rotate(45deg);
    }
    :host([data-placement="above"])::before {
      top: auto;
      bottom: -6px;
      transform: rotate(225deg);
    }
    section { padding: .75rem; max-height: calc(100dvh - 3rem); overflow: auto; }
    header { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
    h2 { margin: 0; font-size: .8rem; font-weight: 650; }
    p { margin: .4rem 0 .75rem; color: #687383; }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 1.8rem;
      padding: .25rem .55rem;
      border: 1px solid #3977c7;
      border-radius: .3rem;
      background: #3977c7;
      color: #fff;
      font: inherit;
      font-size: .7rem;
      cursor: pointer;
    }
    button:hover { background: #2e65ad; }
    button:focus-visible { outline: 2px solid #3977c7; outline-offset: 2px; }
    .close { min-width: 1.8rem; padding: .25rem; border: 0; background: transparent; color: #687383; }
    .close:hover { background: #eef4fb; }
    .close svg { width: 1rem; height: 1rem; }
  `

  anchor: () => HTMLElement | null = () => null
  private availableVersion = ""
  private dismissedVersion = ""
  private poll?: ReturnType<typeof setInterval>
  private request: AbortController | null = null
  private resizeObserver: ResizeObserver | null = null

  connectedCallback() {
    super.connectedCallback()
    this.hidden = true
    if(!appVersion) return
    this.resizeObserver = new ResizeObserver(this.position)
    this.resizeObserver.observe(this)
    window.addEventListener("resize", this.position)
    window.addEventListener("scroll", this.position, true)
    window.addEventListener("focus", this.check)
    window.addEventListener("online", this.check)
    document.addEventListener("visibilitychange", this.check)
    this.poll = setInterval(this.check, 60_000)
    void this.check()
  }

  disconnectedCallback() {
    clearInterval(this.poll)
    this.request?.abort()
    this.request = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    window.removeEventListener("resize", this.position)
    window.removeEventListener("scroll", this.position, true)
    window.removeEventListener("focus", this.check)
    window.removeEventListener("online", this.check)
    document.removeEventListener("visibilitychange", this.check)
    super.disconnectedCallback()
  }

  private check = async () => {
    if(!appVersion || !this.isConnected || document.hidden || navigator.onLine === false || this.request) return
    const request = new AbortController()
    this.request = request
    const timeout = setTimeout(() => request.abort(), 10_000)
    try {
      const response = await fetch(new URL(`${import.meta.env.BASE_URL}version.json`, location.href), {
        cache: "no-store", credentials: "same-origin", redirect: "error", signal: request.signal,
      })
      if(!response.ok) return
      const data = await response.json()
      if(this.request !== request || request.signal.aborted || !this.isConnected) return
      if(typeof data?.version === "string" && data.version) {
        this.availableVersion = data.version === appVersion ? "" : data.version
      }
    }
    catch { /* Offline or partially deployed servers are checked again later. */ }
    finally {
      clearTimeout(timeout)
      if(this.request === request) this.request = null
    }
  }

  protected updated() {
    this.hidden = !this.availableVersion || this.availableVersion === this.dismissedVersion
    this.resizeObserver?.disconnect()
    this.resizeObserver?.observe(this)
    const anchor = this.anchor()
    if(anchor?.isConnected) this.resizeObserver?.observe(anchor)
    this.position()
  }

  private position = () => {
    if(this.hidden) return
    const anchor = this.anchor()
    if(!anchor?.isConnected) return
    const trigger = anchor.getBoundingClientRect()
    const popup = this.getBoundingClientRect()
    const {left, top} = fixedPopupPosition(trigger, popup, {width: innerWidth, height: innerHeight}, 8, 12)
    Object.assign(this.style, {left: `${left}px`, top: `${top}px`})
    this.dataset.placement = top < trigger.top ? "above" : "below"
    this.style.setProperty("--tip-left", `${Math.max(10, Math.min(popup.width - 22, trigger.left + trigger.width / 2 - left - 6))}px`)
  }

  private dismiss() {
    this.dismissedVersion = this.availableVersion
    if(this.shadowRoot?.activeElement) this.anchor()?.closest("button")?.focus({preventScroll: true})
    this.requestUpdate()
  }

  render() {
    if(!this.availableVersion || this.availableVersion === this.dismissedVersion) return nothing
    return html`<section aria-label="App update" @keydown=${(event: KeyboardEvent) => {
      if(event.key === "Escape") { event.stopPropagation(); this.dismiss() }
    }}>
      <header>
        <h2>Update available</h2>
        <button class="close" type="button" aria-label="Dismiss update notification" title="Dismiss update notification"
          @click=${this.dismiss}>${ribbonIcon("Reject")}</button>
      </header>
      <p role="status">A new version of WebWriter is available. Save your work, then reload.</p>
      <button class="reload" type="button" @click=${() => location.reload()}>Reload</button>
    </section>`
  }
}

if(!customElements.get("app-update-notice")) customElements.define("app-update-notice", AppUpdateNotice)

declare global {
  interface HTMLElementTagNameMap {"app-update-notice": AppUpdateNotice}
}
