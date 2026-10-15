import {LitElement, css, html, nothing} from "lit"
import {findExampleDocument, type ExampleDocument} from "../example-documents"
import "./example-document"
import {t, SiteLanguageController} from "../site-language"

/** Shared example dialog for the landing page and gallery. */
export class ExampleDialog extends LitElement {
  private languageController = new SiteLanguageController(this)
  static properties = {selected: {state: true}}
  static styles = css`
    dialog {box-sizing: border-box; inline-size: min(72rem, calc(100vw - 2rem)); max-block-size: calc(100dvh - 2rem); padding: 0; border: 1px solid #dfe5ed; border-radius: .6rem; color: #263142; background: white; overflow: auto}
    dialog::backdrop {background: #17203380}
    @media (max-width: 42rem) {dialog {inline-size: calc(100vw - 1rem); max-block-size: calc(100dvh - 1rem)}}
  `
  private selected: ExampleDocument | null = null
  private onPopState = () => {
    const id = new URL(location.href).searchParams.get("example")
    if(findExampleDocument(id)) void this.open(id!, false)
    else this.close(false)
  }
  connectedCallback() { super.connectedCallback(); window.addEventListener("popstate", this.onPopState) }
  disconnectedCallback() { super.disconnectedCallback(); window.removeEventListener("popstate", this.onPopState) }
  protected firstUpdated() { this.onPopState() }

  async open(id: string, updateURL = true) {
    const example = findExampleDocument(id)
    if(!example) return
    this.selected = example
    if(updateURL) {
      const url = new URL(location.href)
      url.searchParams.set("example", id)
      history.pushState(null, "", url)
    }
    await this.updateComplete
    const dialog = this.renderRoot.querySelector("dialog")!
    if(this.selected && this.isConnected && !dialog.open) dialog.showModal()
  }
  close(updateURL = true) {
    if(updateURL) {
      const url = new URL(location.href)
      url.searchParams.delete("example")
      history.replaceState(null, "", url)
    }
    this.selected = null
    this.renderRoot.querySelector<HTMLDialogElement>("dialog[open]")?.close()
  }
  private onBackdropClick(event: MouseEvent) {
    if(event.target !== event.currentTarget) return
    const bounds = (event.currentTarget as HTMLDialogElement).getBoundingClientRect()
    if(event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) this.close()
  }
  render() {
    return html`<dialog aria-label=${this.selected ? t(this.selected.title) : t("Example")} @click=${this.onBackdropClick} @cancel=${() => this.close()} @close=${() => {if(this.selected) this.close()}}>
      ${this.selected ? html`<example-document example-id=${this.selected.id} @close-example=${() => this.close()}></example-document>` : nothing}
    </dialog>`
  }
}
if(!customElements.get("example-dialog")) customElements.define("example-dialog", ExampleDialog)
