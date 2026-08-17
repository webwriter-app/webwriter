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
import {ribbonIcon} from "../ribbon-icons"

const cloneProvider = (provider: AIProviderConfig): AIProviderConfig => ({
  ...provider,
  models: [...provider.models],
})

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
      grid-template-columns: minmax(10rem, 13rem) minmax(20rem, 1fr);
      grid-template-rows: minmax(0, 1fr);
      width: min(47rem, calc(100vw - 2rem));
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
      flex: 0 1 auto;
      min-height: 0;
      align-content: start;
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

    .advanced-options {
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      background: #f8fafc;
    }

    .advanced-options summary {
      padding: 0.65rem 0.75rem;
      color: #334155;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      user-select: none;
    }

    .advanced-options[open] summary {
      border-bottom: 1px solid #e2e8f0;
    }

    .advanced-options-content {
      display: grid;
      gap: 0.85rem;
      padding: 0.75rem;
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

    .models-section {
      display: grid;
      gap: 0.45rem;
      min-width: 0;
    }

    .models-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      color: #334155;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .models-refresh,
    .model-default {
      box-sizing: border-box;
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 1.8rem;
      height: 1.8rem;
      padding: 0.35rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.35rem;
      color: #526b86;
      background: #ffffff;
      cursor: pointer;
    }

    .models-refresh:hover,
    .models-refresh:focus-visible,
    .model-default:hover,
    .model-default:focus-visible {
      border-color: #8eb6df;
      color: #1e4f87;
      background: #eef4fb;
      outline: none;
    }

    .models-refresh[data-loading] .models-refresh-icon {
      animation: ai-settings-spin 700ms linear infinite;
    }

    .models-refresh-icon,
    .models-refresh-icon svg,
    .model-default-icon,
    .model-default-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .model-list {
      display: grid;
      gap: 0.35rem;
      min-width: 0;
    }

    .model-card {
      box-sizing: border-box;
      min-width: 0;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      border-radius: 0.4rem;
      background: #f8fafc;
    }

    .model-card[data-default] {
      border-color: #93c5fd;
      background: #eff6ff;
    }

    .model-card-summary {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      min-height: 2.1rem;
      padding: 0.25rem 0.3rem 0.25rem 0.6rem;
    }

    .model-name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      color: #334155;
      font-size: 0.75rem;
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .model-default {
      margin-left: auto;
      border-color: transparent;
      color: #94a3b8;
      background: transparent;
    }

    .model-default[aria-pressed="true"] {
      color: #d97706;
      background: #fffbeb;
    }

    .model-empty {
      margin: 0;
      color: #64748b;
      font-size: 0.68rem;
      font-weight: 400;
      line-height: 1.4;
    }

    @keyframes ai-settings-spin {
      to { transform: rotate(360deg); }
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
  private autoFetchTimer: ReturnType<typeof setTimeout> | undefined
  private autoFetchSignature = ""
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
    this.resetAutoFetch()
    this.subscribedStore?.removeEventListener("change", this.handleStoreChange)
    this.subscribedStore = null
    super.disconnectedCallback()
  }

  show() {
    this.resetAutoFetch()
    const active = this.store?.activeProvider
    this.draft = active ? cloneProvider(active) : this.store?.prepare(createAIProvider("openai")) ?? createAIProvider("openai")
    this.apiKey = ""
    this.passphrase = ""
    this.error = ""
    this.notice = ""
    this.pendingDelete = false
    this.open = true
    this.scheduleAutoFetchModels()
  }

  close() {
    this.resetAutoFetch()
    this.apiKey = ""
    this.passphrase = ""
    this.open = false
    this.dispatchEvent(new Event("ai-settings-close", {bubbles: true, composed: true}))
  }

  private selectProvider(providerId: string) {
    const provider = this.store?.provider(providerId)
    if(!provider) return
    this.resetAutoFetch()
    this.draft = cloneProvider(provider)
    this.apiKey = ""
    this.passphrase = ""
    this.error = ""
    this.notice = ""
    this.pendingDelete = false
    this.scheduleAutoFetchModels()
  }

  private startProvider(preset: AIProviderPreset) {
    this.resetAutoFetch()
    this.draft = this.store?.prepare(createAIProvider(preset)) ?? createAIProvider(preset)
    this.apiKey = ""
    this.passphrase = ""
    this.error = ""
    this.notice = ""
    this.pendingDelete = false
  }

  private resetAutoFetch() {
    if(this.autoFetchTimer !== undefined) {
      clearTimeout(this.autoFetchTimer)
      this.autoFetchTimer = undefined
    }
    this.autoFetchSignature = ""
  }

  private clearAutoFetchTimer() {
    if(this.autoFetchTimer === undefined) return
    clearTimeout(this.autoFetchTimer)
    this.autoFetchTimer = undefined
  }

  private canFetchModels() {
    const draft = this.draft
    if(!draft || !this.store || !draft.name.trim()) return false
    try {
      const url = new URL(draft.baseUrl.trim())
      if(url.protocol !== "http:" && url.protocol !== "https:") return false
      if(url.username || url.password) return false
    }
    catch {
      return false
    }
    if(draft.managed === "backend" || draft.auth === "none") return true
    return Boolean(this.apiKey.trim() || this.store.keyFor(draft))
  }

  private modelFetchSignature() {
    if(!this.canFetchModels() || !this.draft || !this.store) return ""
    const credential = this.draft.managed === "backend"
      ? "backend"
      : this.draft.auth === "none"
        ? "none"
        : this.apiKey.trim() || this.store.keyFor(this.draft) || ""
    return [this.draft.id, this.draft.baseUrl.trim(), this.draft.auth, credential].join("\u0000")
  }

  private scheduleAutoFetchModels() {
    this.clearAutoFetchTimer()
    if(this.loading) return
    const signature = this.modelFetchSignature()
    if(!signature || signature === this.autoFetchSignature) return
    this.autoFetchTimer = setTimeout(() => {
      this.autoFetchTimer = undefined
      if(this.loading || !this.canFetchModels()) return
      this.autoFetchSignature = signature
      void this.fetchModels()
    }, 300)
  }

  private updateDraft<K extends keyof AIProviderConfig>(key: K, value: AIProviderConfig[K]) {
    if(!this.draft) return
    this.draft = {...this.draft, [key]: value}
    this.error = ""
    this.notice = ""
    this.pendingDelete = false
  }

  private updateBaseUrl(event: Event) {
    this.updateDraft("baseUrl", (event.currentTarget as HTMLInputElement).value)
    this.resetAutoFetch()
    this.scheduleAutoFetchModels()
  }

  private updateAuth(event: Event) {
    this.updateDraft("auth", (event.currentTarget as HTMLSelectElement).value as AIProviderAuth)
    this.resetAutoFetch()
    this.scheduleAutoFetchModels()
  }

  private updateAPIKey(event: Event) {
    this.apiKey = (event.currentTarget as HTMLInputElement).value
    this.error = ""
    this.notice = ""
    this.pendingDelete = false
    this.resetAutoFetch()
    this.scheduleAutoFetchModels()
  }

  private setDefaultModel(model: string) {
    if(!this.draft?.models.includes(model)) return
    this.updateDraft("defaultModel", model)
  }

  private renderModelCard(model: string) {
    const isDefault = this.draft?.defaultModel === model
    const star = html`
      <button
        class="model-default"
        type="button"
        aria-label=${isDefault ? `${model} is the default model` : `Set ${model} as default model`}
        title=${isDefault ? "Default model" : "Set as default model"}
        aria-pressed=${isDefault}
        ?disabled=${this.loading}
        @click=${(event: MouseEvent) => {
          event.preventDefault()
          event.stopPropagation()
          this.setDefaultModel(model)
        }}
      ><span class="model-default-icon" aria-hidden="true">${ribbonIcon("Star")}</span></button>
    `
    const cardHeader = html`
      <span class="model-card-summary">
        <span class="model-name" title=${model}>${model}</span>
        ${star}
      </span>
    `
    return html`<article class="model-card" role="listitem" ?data-default=${isDefault}>${cardHeader}</article>`
  }

  private credentialText() {
    if(!this.draft || !this.store) return ""
    const status = this.store.credentialStatus(this.draft)
    if(this.draft.managed === "backend") {
      if(status === "not-required") return "This endpoint does not require an API key."
      if(status === "available") return "The API key is stored by the localhost development server."
      return "No API key is stored by the localhost development server."
    }
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
    this.resetAutoFetch()
    this.loading = true
    this.error = ""
    this.notice = ""
    try {
      const provider = normalizeAIProvider(this.draft)
      const previous = this.store.provider(provider.id)
      if(provider.managed !== "backend") await this.persistCredential(provider, previous)
      const saved = await this.store.save(provider, this.apiKey.trim() || undefined)
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
      this.scheduleAutoFetchModels()
    }
  }

  private fetchModels = async () => {
    this.clearAutoFetchTimer()
    if(!this.draft || !this.store || this.loading) return
    this.loading = true
    this.error = ""
    this.notice = ""
    try {
      const provider = normalizeAIProvider(this.draft)
      let source = provider
      let key = this.apiKey.trim() || this.store.keyFor(provider)
      if(provider.managed === "backend") {
        source = await this.store.save(provider, this.apiKey.trim() || undefined)
        key = ""
      }
      const models = await listAIModels(source, key)
      const next = {
        ...source,
        models,
        defaultModel: models.includes(source.defaultModel) ? source.defaultModel : models[0] ?? "",
      }
      this.draft = provider.managed === "backend" ? await this.store.save(next) : next
      this.notice = `${models.length} model${models.length === 1 ? "" : "s"} loaded.${provider.managed === "backend" ? " Provider saved." : " Save to keep this list."}`
    }
    catch(error) {
      this.error = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.loading = false
    }
  }

  private removeProvider = async () => {
    if(!this.draft || !this.store?.provider(this.draft.id)) return
    if(!this.pendingDelete) {
      this.pendingDelete = true
      return
    }
    this.loading = true
    this.error = ""
    try {
      await this.store.delete(this.draft.id)
      const next = this.store.activeProvider
      this.draft = next ? cloneProvider(next) : this.store.prepare(createAIProvider("openai"))
      this.pendingDelete = false
      this.apiKey = ""
      this.passphrase = ""
      this.notice = "Provider deleted."
    }
    catch(error) {
      this.error = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.loading = false
    }
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
    const encryptedStored = this.draft.managed !== "backend" && Boolean(this.store?.vault.hasEncrypted(this.draft.id))
    const modelFetchReady = this.canFetchModels()
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
              <button class="preset-button" type="button" @click=${() => this.startProvider("custom")}>Custom</button>
            </div>
          </aside>
          <main class="content">
            <header class="content-header">
              <h2>${existing ? `Edit ${this.draft.name}` : `Add ${this.draft.name}`}</h2>
              <button class="close" type="button" aria-label="Close AI settings" @click=${this.close}>×</button>
            </header>
            <form @submit=${this.save}>
              <label>
                Name
                <input required .value=${this.draft.name} @input=${(event: Event) => this.updateDraft("name", (event.currentTarget as HTMLInputElement).value)}>
              </label>
              <label>
                OpenAI-compatible base URL
                <input required inputmode="url" spellcheck="false" ?disabled=${this.loading} .value=${this.draft.baseUrl} @input=${this.updateBaseUrl}>
                <span class="hint">${this.draft.managed === "backend"
                  ? "Requests use the localhost Inference API; credentials are not sent to the browser."
                  : html`The app calls <code>/models</code> and <code>/chat/completions</code> directly from this browser.`}</span>
              </label>

              <details class="advanced-options">
                <summary>Advanced options</summary>
                <div class="advanced-options-content">
                  <label>
                    Authentication
                    <select ?disabled=${this.loading} .value=${this.draft.auth} @change=${this.updateAuth}>
                      <option value="bearer">Bearer API key</option>
                      <option value="api-key">api-key header</option>
                      <option value="x-api-key">x-api-key header</option>
                      <option value="none">No authentication</option>
                    </select>
                  </label>
                  <label>
                    Additional model instructions (optional)
                    <textarea ?disabled=${this.loading} .value=${this.draft.customInstructions ?? ""} @input=${(event: Event) => this.updateDraft("customInstructions", (event.currentTarget as HTMLTextAreaElement).value)}></textarea>
                  </label>
                </div>
              </details>

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
                      ?disabled=${this.loading}
                      @input=${this.updateAPIKey}
                    >
                  </label>
                  ${this.draft.managed === "backend" ? nothing : html`<label>
                      Key storage
                      <select .value=${this.draft.keyMode} @change=${(event: Event) => this.updateDraft("keyMode", (event.currentTarget as HTMLSelectElement).value as AIKeyMode)}>
                        <option value="memory">This tab only (recommended)</option>
                        <option value="encrypted">Encrypted on this device</option>
                      </select>
                      <span class="hint">Encrypted storage uses AES-GCM with a key derived from your passphrase. The passphrase is never stored, so you must unlock the key after a reload.</span>
                    </label>`}
                  ${this.draft.managed !== "backend" && (this.draft.keyMode === "encrypted" || encryptedStored) ? html`
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

              <section class="models-section" aria-labelledby="models-title">
                <div class="models-header">
                  <span id="models-title">Models</span>
                  <button
                    class="models-refresh"
                    type="button"
                    aria-label="Refresh models"
                    title=${this.loading ? "Loading models…" : "Refresh models"}
                    ?disabled=${this.loading || !modelFetchReady}
                    ?data-loading=${this.loading}
                    @click=${this.fetchModels}
                  ><span class="models-refresh-icon" aria-hidden="true">${ribbonIcon("Refresh")}</span></button>
                </div>
                ${this.draft.models.length ? html`
                  <div class="model-list" role="list" aria-label="Available models">
                    ${this.draft.models.map(model => this.renderModelCard(model))}
                  </div>
                ` : html`<p class="model-empty">No models loaded yet. Provide the endpoint and credentials to load them.</p>`}
              </section>

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
