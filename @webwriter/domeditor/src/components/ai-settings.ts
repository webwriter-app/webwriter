import {LitElement, css, html, nothing, type PropertyValues} from "lit"
import {
  AIProviderStore,
  createAIProvider,
  normalizeAIProvider,
  type AIKeyMode,
  type AIProviderAuth,
  type AIProviderConfig,
  type AIProviderPreset,
} from "../ai-provider"
import {listAIModels} from "../ai-client"

const cloneProvider = (provider: AIProviderConfig): AIProviderConfig => ({
  ...provider,
  models: [...provider.models],
})

const modelLines = (value: string) => value
  .split(/[\n,]/)
  .map(model => model.trim())
  .filter(Boolean)

export class AISettingsDialog extends LitElement {
  static properties = {
    open: {type: Boolean, reflect: true},
    store: {attribute: false},
    draft: {attribute: false, state: true},
    loading: {type: Boolean, state: true},
    error: {type: String, state: true},
    notice: {type: String, state: true},
    pendingDelete: {type: Boolean, state: true},
  }

  static styles = css`
    :host {
      color: #202833;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    :host(:not([open])) {
      display: none;
    }

    .backdrop {
      box-sizing: border-box;
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 1rem;
      overflow: hidden;
      background: rgb(15 23 42 / 45%);
      z-index: 2147483600;
    }

    .dialog {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: minmax(10rem, 13rem) minmax(20rem, 34rem);
      grid-template-rows: minmax(0, 1fr);
      width: min(50rem, calc(100vw - 2rem));
      height: min(45rem, calc(100vh - 2rem));
      height: min(45rem, calc(100dvh - 2rem));
      max-height: min(45rem, calc(100vh - 2rem));
      overflow: hidden;
      border: 1px solid #cbd5e1;
      border-radius: 0.75rem;
      background: #ffffff;
      box-shadow: 0 1.25rem 3rem rgb(15 23 42 / 28%);
    }

    .sidebar {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 1rem 0.75rem;
      overflow: hidden;
      border-right: 1px solid #e2e8f0;
      background: #f8fafc;
    }

    h2,
    h3,
    p {
      margin: 0;
    }

    h2 {
      font-size: 1rem;
      line-height: 1.4;
    }

    h3 {
      margin-top: 1rem;
      color: #64748b;
      font-size: 0.7rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .providers,
    .presets {
      display: grid;
      gap: 0.3rem;
      margin-top: 0.5rem;
    }

    .providers {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior-y: contain;
      scrollbar-gutter: stable;
    }

    .presets {
      flex: 0 0 auto;
    }

    .sidebar button,
    .dialog-button {
      min-height: 2rem;
      padding: 0.35rem 0.55rem;
      border: 1px solid transparent;
      border-radius: 0.4rem;
      color: #334155;
      background: transparent;
      font: inherit;
      font-size: 0.75rem;
      text-align: left;
      cursor: pointer;
    }

    .sidebar button:hover,
    .sidebar button:focus-visible {
      border-color: #cbd5e1;
      background: #ffffff;
      outline: none;
    }

    .providers button[aria-current="true"] {
      border-color: #93c5fd;
      color: #1d4ed8;
      background: #eff6ff;
      font-weight: 600;
    }

    .preset-button::before {
      content: "+";
      display: inline-block;
      width: 1rem;
      color: #2563eb;
      font-weight: 700;
    }

    .content {
      min-width: 0;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior-y: contain;
      scrollbar-gutter: stable;
    }

    .content-header {
      display: flex;
      position: sticky;
      top: 0;
      align-items: center;
      justify-content: space-between;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid #e2e8f0;
      background: #ffffff;
      z-index: 1;
    }

    .close {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      padding: 0;
      border: 0;
      border-radius: 50%;
      color: #64748b;
      background: transparent;
      font-size: 1.25rem;
      cursor: pointer;
    }

    .close:hover,
    .close:focus-visible {
      color: #0f172a;
      background: #f1f5f9;
      outline: none;
    }

    form {
      display: grid;
      gap: 0.85rem;
      padding: 1rem;
    }

    label,
    fieldset {
      display: grid;
      gap: 0.3rem;
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
      color: #334155;
      font-size: 0.75rem;
      font-weight: 600;
    }

    input,
    select,
    textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 2.25rem;
      padding: 0.45rem 0.55rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.4rem;
      color: #0f172a;
      background: #ffffff;
      font: inherit;
      font-size: 0.8rem;
      font-weight: 400;
      user-select: text;
    }

    textarea {
      min-height: 5rem;
      resize: vertical;
    }

    input:focus,
    select:focus,
    textarea:focus {
      border-color: #60a5fa;
      outline: 2px solid rgb(96 165 250 / 20%);
    }

    .row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }

    .hint,
    .credential-status {
      color: #64748b;
      font-size: 0.68rem;
      font-weight: 400;
      line-height: 1.4;
    }

    .credential-panel {
      display: grid;
      gap: 0.7rem;
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      background: #f8fafc;
    }

    .credential-panel legend {
      padding: 0 0.2rem;
      color: #334155;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .feedback {
      padding: 0.55rem 0.65rem;
      border-radius: 0.4rem;
      font-size: 0.72rem;
      line-height: 1.4;
    }

    .error {
      color: #991b1b;
      background: #fef2f2;
    }

    .notice {
      color: #166534;
      background: #f0fdf4;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.5rem;
      padding-top: 0.35rem;
    }

    .dialog-button {
      border-color: #cbd5e1;
      background: #ffffff;
      text-align: center;
    }

    .dialog-button:hover,
    .dialog-button:focus-visible {
      border-color: #94a3b8;
      outline: none;
    }

    .dialog-button.primary {
      border-color: #2563eb;
      color: #ffffff;
      background: #2563eb;
      font-weight: 600;
    }

    .dialog-button.danger {
      margin-right: auto;
      border-color: #fecaca;
      color: #b91c1c;
    }

    .dialog-button:disabled,
    button:disabled {
      opacity: 0.55;
      cursor: default;
    }

    @media (max-width: 42rem) {
      .dialog {
        grid-template-columns: 1fr;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .sidebar {
        max-height: 12rem;
        border-right: 0;
        border-bottom: 1px solid #e2e8f0;
      }

      .providers,
      .presets {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .row {
        grid-template-columns: 1fr;
      }
    }
  `

  open = false
  store: AIProviderStore | null = null
  private draft: AIProviderConfig | null = null
  private loading = false
  private error = ""
  private notice = ""
  private pendingDelete = false
  private apiKey = ""
  private passphrase = ""
  private subscribedStore: AIProviderStore | null = null
  private readonly handleStoreChange = () => {
    if(this.draft && this.store?.provider(this.draft.id)) {
      this.draft = cloneProvider(this.store.provider(this.draft.id)!)
    }
    this.requestUpdate()
  }

  protected updated(changed: PropertyValues<this>) {
    if(changed.has("store")) {
      this.subscribedStore?.removeEventListener("change", this.handleStoreChange)
      this.subscribedStore = this.store
      this.subscribedStore?.addEventListener("change", this.handleStoreChange)
    }
    if(changed.has("open") && this.open) {
      queueMicrotask(() => this.renderRoot.querySelector<HTMLElement>(".dialog")?.focus())
    }
  }

  disconnectedCallback() {
    this.subscribedStore?.removeEventListener("change", this.handleStoreChange)
    this.subscribedStore = null
    super.disconnectedCallback()
  }

  show() {
    const active = this.store?.activeProvider
    this.draft = active ? cloneProvider(active) : createAIProvider("openai")
    this.apiKey = ""
    this.passphrase = ""
    this.error = ""
    this.notice = ""
    this.pendingDelete = false
    this.open = true
  }

  close() {
    this.apiKey = ""
    this.passphrase = ""
    this.open = false
    this.dispatchEvent(new Event("ai-settings-close", {bubbles: true, composed: true}))
  }

  private selectProvider(providerId: string) {
    const provider = this.store?.provider(providerId)
    if(!provider) return
    this.draft = cloneProvider(provider)
    this.apiKey = ""
    this.passphrase = ""
    this.error = ""
    this.notice = ""
    this.pendingDelete = false
  }

  private startProvider(preset: AIProviderPreset) {
    this.draft = createAIProvider(preset)
    this.apiKey = ""
    this.passphrase = ""
    this.error = ""
    this.notice = ""
    this.pendingDelete = false
  }

  private updateDraft<K extends keyof AIProviderConfig>(key: K, value: AIProviderConfig[K]) {
    if(!this.draft) return
    this.draft = {...this.draft, [key]: value}
    this.error = ""
    this.notice = ""
    this.pendingDelete = false
  }

  private credentialText() {
    if(!this.draft || !this.store) return ""
    const status = this.store.credentialStatus(this.draft)
    if(status === "not-required") return "This endpoint does not require an API key."
    if(status === "available") return this.draft.keyMode === "encrypted"
      ? "The encrypted key is unlocked for this tab."
      : "The key is available only in this tab."
    if(status === "locked") return "An encrypted key is stored, but it is locked. Enter its passphrase to use it."
    return "No API key is available."
  }

  private async persistCredential(provider: AIProviderConfig, previous?: AIProviderConfig) {
    if(!this.store) throw new Error("AI settings are unavailable")
    const vault = this.store.vault
    if(provider.auth === "none") {
      vault.remove(provider.id)
      return
    }

    const enteredKey = this.apiKey.trim()
    const currentKey = enteredKey || vault.get(provider.id) || ""
    const modeChanged = previous && previous.keyMode !== provider.keyMode
    if(provider.keyMode === "encrypted") {
      if(enteredKey || modeChanged) {
        if(!currentKey) throw new Error("Enter or unlock the API key before enabling encrypted storage")
        await vault.setEncrypted(provider.id, currentKey, this.passphrase)
      }
      return
    }

    if(enteredKey || modeChanged) {
      if(!currentKey) throw new Error("Enter or unlock the API key before switching to tab-only storage")
      vault.setMemory(provider.id, currentKey)
      vault.removeEncrypted(provider.id)
    }
  }

  private save = async (event: SubmitEvent) => {
    event.preventDefault()
    if(!this.draft || !this.store || this.loading) return
    this.loading = true
    this.error = ""
    this.notice = ""
    try {
      const provider = normalizeAIProvider(this.draft)
      const previous = this.store.provider(provider.id)
      await this.persistCredential(provider, previous)
      const saved = this.store.upsert(provider)
      this.draft = cloneProvider(saved)
      this.apiKey = ""
      this.passphrase = ""
      this.notice = "Provider saved."
    }
    catch(error) {
      this.error = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.loading = false
    }
  }

  private unlock = async () => {
    if(!this.draft || !this.store || this.loading) return
    this.loading = true
    this.error = ""
    this.notice = ""
    try {
      await this.store.vault.unlock(this.draft.id, this.passphrase)
      this.passphrase = ""
      this.notice = "API key unlocked for this tab."
    }
    catch(error) {
      this.error = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.loading = false
    }
  }

  private fetchModels = async () => {
    if(!this.draft || !this.store || this.loading) return
    this.loading = true
    this.error = ""
    this.notice = ""
    try {
      const provider = normalizeAIProvider(this.draft)
      const key = this.apiKey.trim() || this.store.vault.get(provider.id)
      const models = await listAIModels(provider, key)
      this.draft = {
        ...provider,
        models,
        defaultModel: models.includes(provider.defaultModel) ? provider.defaultModel : models[0] ?? "",
      }
      this.notice = `${models.length} model${models.length === 1 ? "" : "s"} loaded. Save to keep this list.`
    }
    catch(error) {
      this.error = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.loading = false
    }
  }

  private removeProvider = () => {
    if(!this.draft || !this.store?.provider(this.draft.id)) return
    if(!this.pendingDelete) {
      this.pendingDelete = true
      return
    }
    this.store.remove(this.draft.id)
    const next = this.store.activeProvider
    this.draft = next ? cloneProvider(next) : createAIProvider("openai")
    this.pendingDelete = false
    this.apiKey = ""
    this.passphrase = ""
    this.notice = "Provider deleted."
  }

  private handleBackdropClick(event: MouseEvent) {
    if(event.target === event.currentTarget) this.close()
  }

  private handleKeydown(event: KeyboardEvent) {
    if(event.key === "Escape") {
      event.stopPropagation()
      this.close()
    }
  }

  render() {
    if(!this.open || !this.draft) return nothing
    const providers = this.store?.providers ?? []
    const existing = Boolean(this.store?.provider(this.draft.id))
    const encryptedStored = Boolean(this.store?.vault.hasEncrypted(this.draft.id))
    return html`
      <div class="backdrop" @click=${this.handleBackdropClick} @keydown=${this.handleKeydown}>
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title" tabindex="-1" @click=${(event: Event) => event.stopPropagation()}>
          <aside class="sidebar">
            <h2 id="ai-settings-title">AI providers</h2>
            <div class="providers" aria-label="Configured providers">
              ${providers.length ? providers.map(provider => html`
                <button
                  type="button"
                  aria-current=${provider.id === this.draft!.id}
                  @click=${() => this.selectProvider(provider.id)}
                >${provider.name}</button>
              `) : html`<p class="hint">No providers configured yet.</p>`}
            </div>
            <h3>Add provider</h3>
            <div class="presets">
              <button class="preset-button" type="button" @click=${() => this.startProvider("openai")}>OpenAI</button>
              <button class="preset-button" type="button" @click=${() => this.startProvider("ollama")}>Ollama</button>
              <button class="preset-button" type="button" @click=${() => this.startProvider("lm-studio")}>LM Studio</button>
              <button class="preset-button" type="button" @click=${() => this.startProvider("custom")}>Custom</button>
            </div>
          </aside>
          <main class="content">
            <header class="content-header">
              <h2>${existing ? `Edit ${this.draft.name}` : `Add ${this.draft.name}`}</h2>
              <button class="close" type="button" aria-label="Close AI settings" @click=${this.close}>×</button>
            </header>
            <form @submit=${this.save}>
              <div class="row">
                <label>
                  Name
                  <input required .value=${this.draft.name} @input=${(event: Event) => this.updateDraft("name", (event.currentTarget as HTMLInputElement).value)}>
                </label>
                <label>
                  Authentication
                  <select .value=${this.draft.auth} @change=${(event: Event) => this.updateDraft("auth", (event.currentTarget as HTMLSelectElement).value as AIProviderAuth)}>
                    <option value="bearer">Bearer API key</option>
                    <option value="api-key">api-key header</option>
                    <option value="x-api-key">x-api-key header</option>
                    <option value="none">No authentication</option>
                  </select>
                </label>
              </div>
              <label>
                OpenAI-compatible base URL
                <input required inputmode="url" spellcheck="false" .value=${this.draft.baseUrl} @input=${(event: Event) => this.updateDraft("baseUrl", (event.currentTarget as HTMLInputElement).value)}>
                <span class="hint">The app calls <code>/models</code> and <code>/chat/completions</code> directly from this browser.</span>
              </label>

              ${this.draft.auth !== "none" ? html`
                <fieldset class="credential-panel">
                  <legend>API key</legend>
                  <span class="credential-status">${this.credentialText()}</span>
                  <label>
                    ${existing ? "Replace API key (leave blank to keep it)" : "API key"}
                    <input
                      type="password"
                      autocomplete="off"
                      spellcheck="false"
                      .value=${this.apiKey}
                      @input=${(event: Event) => { this.apiKey = (event.currentTarget as HTMLInputElement).value }}
                    >
                  </label>
                  <label>
                    Key storage
                    <select .value=${this.draft.keyMode} @change=${(event: Event) => this.updateDraft("keyMode", (event.currentTarget as HTMLSelectElement).value as AIKeyMode)}>
                      <option value="memory">This tab only (recommended)</option>
                      <option value="encrypted">Encrypted on this device</option>
                    </select>
                    <span class="hint">Encrypted storage uses AES-GCM with a key derived from your passphrase. The passphrase is never stored, so you must unlock the key after a reload.</span>
                  </label>
                  ${this.draft.keyMode === "encrypted" || encryptedStored ? html`
                    <label>
                      ${encryptedStored && !this.apiKey ? "Unlock passphrase" : "Encryption passphrase"}
                      <input
                        type="password"
                        minlength="8"
                        autocomplete="new-password"
                        .value=${this.passphrase}
                        @input=${(event: Event) => { this.passphrase = (event.currentTarget as HTMLInputElement).value }}
                      >
                    </label>
                    ${encryptedStored ? html`
                      <button class="dialog-button" type="button" ?disabled=${this.loading || !this.passphrase} @click=${this.unlock}>Unlock existing key</button>
                    ` : nothing}
                  ` : nothing}
                </fieldset>
              ` : nothing}

              <label>
                Models
                <textarea
                  spellcheck="false"
                  placeholder="One model ID per line"
                  .value=${this.draft.models.join("\n")}
                  @input=${(event: Event) => this.updateDraft("models", modelLines((event.currentTarget as HTMLTextAreaElement).value))}
                ></textarea>
              </label>
              <div class="row">
                <label>
                  Default model
                  <select .value=${this.draft.defaultModel} @change=${(event: Event) => this.updateDraft("defaultModel", (event.currentTarget as HTMLSelectElement).value)}>
                    <option value="" ?selected=${!this.draft.defaultModel}>Choose a model</option>
                    ${this.draft.models.map(model => html`<option value=${model} ?selected=${this.draft!.defaultModel === model}>${model}</option>`)}
                  </select>
                </label>
                <label>
                  <span aria-hidden="true">Provider models</span>
                  <button class="dialog-button" type="button" ?disabled=${this.loading} @click=${this.fetchModels}>${this.loading ? "Connecting…" : "Test & load models"}</button>
                </label>
              </div>
              <label>
                Additional model instructions (optional)
                <textarea .value=${this.draft.customInstructions ?? ""} @input=${(event: Event) => this.updateDraft("customInstructions", (event.currentTarget as HTMLTextAreaElement).value)}></textarea>
              </label>

              ${this.error ? html`<p class="feedback error" role="alert">${this.error}</p>` : nothing}
              ${this.notice ? html`<p class="feedback notice" role="status">${this.notice}</p>` : nothing}
              <div class="actions">
                ${existing ? html`
                  <button class="dialog-button danger" type="button" ?disabled=${this.loading} @click=${this.removeProvider}>
                    ${this.pendingDelete ? "Confirm delete" : "Delete provider"}
                  </button>
                ` : nothing}
                <button class="dialog-button" type="button" @click=${this.close}>Cancel</button>
                <button class="dialog-button primary" type="submit" ?disabled=${this.loading}>${this.loading ? "Saving…" : "Save provider"}</button>
              </div>
            </form>
          </main>
        </section>
      </div>
    `
  }
}

if(!customElements.get("ai-settings-dialog")) {
  customElements.define("ai-settings-dialog", AISettingsDialog)
}

declare global {
  interface HTMLElementTagNameMap {
    "ai-settings-dialog": AISettingsDialog
  }
}
