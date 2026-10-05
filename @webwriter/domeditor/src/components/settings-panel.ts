import {LitElement, css, html} from "lit"
import {repeat} from "lit/directives/repeat.js"
import {keyed} from "lit/directives/keyed.js"
import {
  appCommands,
  defaultAppSettings,
  reservedShortcutReason,
  shortcutFromEvent,
  shortcutParts,
  type AppSettings,
  type AppCommand,
} from "../app-settings"
import {documentLanguages} from "../document-languages"
import {appIconUrl, ribbonIcon} from "../ribbon-icons"
import {documentLayoutLabel, documentLayoutModes} from "./layout-preview"
import {cloudServiceURL, EDUMIX_URL, cloudServiceExpired, type CloudService} from "../cloud-services"
import {connectCloudService} from "../backend-client"
import componentLicenses from "virtual:component-licenses"

const languageLabel = (code: string, fallback: string) => {
  try {
    const english = new Intl.DisplayNames(["en"], {type: "language"}).of(code) ?? fallback
    const native = new Intl.DisplayNames([code], {type: "language"}).of(code) ?? ""
    return native && native.toLocaleLowerCase() !== english.toLocaleLowerCase()
      ? `${english} (${native})`
      : `${english} (${english})`
  }
  catch {
    return fallback
  }
}

const languageOptions = documentLanguages.map(language => ({
  value: language.code,
  label: languageLabel(language.code, language.name),
}))

export class SettingsPanel extends LitElement {
  static properties = {
    settings: {attribute: false},
    recordingCommandId: {type: String, state: true},
    message: {type: String, state: true},
    error: {type: String, state: true},
    signingIn: {type: String, state: true},
    cloudError: {type: String, state: true},
    providerType: {type: String, state: true},
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      width: 100%;
      min-height: 0;
      color: #2f3742;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .licenses-link {
      display: block;
      margin-top: 1.5rem;
      padding: 0;
      border: 0;
      color: #3977c7;
      background: transparent;
      font: inherit;
      font-size: .66rem;
      text-decoration: underline;
      cursor: pointer;
    }
    .licenses-link:focus-visible { outline: 2px solid #3977c7; outline-offset: 3px; }
    #licenses-dialog {
      box-sizing: border-box;
      width: min(48rem, calc(100vw - 2rem));
      max-height: calc(100dvh - 2rem);
      padding: 1rem;
      border: 1px solid #c4ccd6;
      border-radius: .65rem;
      color: inherit;
      background: white;
      overflow: hidden;
    }
    #licenses-dialog[open] { display: flex; flex-direction: column; }
    #licenses-dialog::backdrop { background: rgb(15 23 42 / 45%); }
    #licenses-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    #licenses-dialog h2 { margin: 0; font-size: 1rem; }
    #licenses-dialog pre {
      min-height: 0;
      margin: 1rem 0 0;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: .72rem;
      line-height: 1.5;
    }

    .command-icon {
      display: block;
      flex: 0 0 auto;
      width: 1rem;
      height: 1rem;
      color: #526b86;
    }

    .command-icon svg {
      display: block;
      width: 100%;
    }

    select {
      box-sizing: border-box;
      width: 100%;
      min-height: 2.25rem;
      padding: 0.35rem 2rem 0.35rem 0.55rem;
      border: 1px solid #c4ccd6;
      border-radius: 0.35rem;
      color: #2f3742;
      background: #ffffff;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' fill='none' stroke='%23526b86' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right .875rem center;
      background-size: .75rem .75rem;
      font: inherit;
      font-size: 0.75rem;
    }

    .setting-description,
    .command-description,
    .shortcut-help {
      color: #687383;
      font-size: 0.66rem;
      line-height: 1.35;
    }

    .setting-description {
      margin: 0.3rem 0 0;
    }

    .setting-label {
      display: block;
      margin-bottom: 0.35rem;
      font-size: 0.72rem;
      font-weight: 600;
    }

    .setting-card + .setting-card {
      margin-top: 1rem;
    }

    .cloud-service {
      position: relative;
      margin-top: .7rem;
      padding: .75rem;
      border: 1px solid #c4ccd6;
      border-radius: .45rem;
    }
    .cloud-service[data-active] { border-color: #93b9e8; background: #f8fbff; }
    .cloud-service-header {
      display: flex;
      align-items: center;
      gap: .5rem;
      margin: 0;
      padding-right: 1.5rem;
      overflow-wrap: anywhere;
    }
    .cloud-service-header input { margin: 0; accent-color: #3977c7; }
    .local-settings { display: flex; align-items: center; gap: .75rem; }
    .local-settings > .setting-label { display: flex; align-items: center; gap: .5rem; flex: 0 0 auto; margin: 0; }
    .local-settings input[type="radio"] { margin: 0; accent-color: #3977c7; }
    .local-settings #local-username { width: min(18rem, 100%); min-width: 0; margin: 0; }
    #local-username:disabled { color: #8993a1; background: #f2f4f7; }
    .cloud-service-header .provider-icon { flex: 0 0 1.1rem; }
    .provider-icon { display: block; width: 1.1rem; height: 1.1rem; }
    .provider-icon svg { display: block; width: 100%; height: 100%; }
    .cloud-service form, .cloud-identity, .new-provider { margin-top: .75rem; }
    .cloud-service input:not([type="radio"]), .new-provider input, #local-username {
      box-sizing: border-box; width: 100%; padding: .4rem; margin: .25rem 0;
      border: 1px solid #c4ccd6; border-radius: .35rem; font: inherit; font-size: .75rem;
    }
    .cloud-actions { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .4rem; }
    .cloud-button, .provider-types button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: .45rem;
      min-height: 2rem;
      padding: .4rem .65rem;
      border: 1px solid #c4ccd6;
      border-radius: .35rem;
      color: #2f3742;
      background: #f7f8fa;
      font: inherit;
      font-size: .72rem;
      font-weight: 600;
      cursor: pointer;
    }
    .cloud-button:hover, .provider-types button:hover { background: #eef4fb; border-color: #93b9e8; }
    .cloud-button.primary { color: white; background: #3977c7; border-color: #3977c7; }
    .cloud-button.primary:hover { background: #2e65ad; }
    .cloud-button:disabled, .provider-types button:disabled { opacity: .55; cursor: default; }
    .cloud-remove {
      position: absolute;
      top: .4rem;
      right: .4rem;
      width: 1.6rem;
      height: 1.6rem;
      padding: 0;
      border: 0;
      border-radius: .3rem;
      color: #687383;
      background: transparent;
      font: inherit;
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
    }
    .cloud-remove:hover { color: #9a3412; background: #fff0e8; }
    .provider-types { display: inline-flex; max-width: 100%; }
    .provider-types button { border-radius: 0; }
    .provider-types button:first-child { border-radius: .35rem 0 0 .35rem; }
    .provider-types button:last-child { border-radius: 0 .35rem .35rem 0; margin-left: -1px; }
    .provider-types button[aria-pressed="true"] { position: relative; color: #1e4f87; background: #e8f2fd; border-color: #3977c7; }
    .add-provider-label { margin-top: 1rem; }
    .cloud-button:focus-visible, .cloud-remove:focus-visible, .provider-types button:focus-visible,
    .cloud-service input:focus-visible, .new-provider input:focus-visible, #local-username:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 2px;
    }

    .checkbox-setting {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0.1rem 0.5rem;
      align-items: start;
      margin-top: 0.7rem;
      cursor: pointer;
    }

    .checkbox-setting input {
      width: 1rem;
      height: 1rem;
      margin: 0.05rem 0 0;
      accent-color: #3977c7;
    }

    .checkbox-label {
      font-size: 0.72rem;
      font-weight: 650;
    }

    .checkbox-description {
      grid-column: 2;
      color: #687383;
      font-size: 0.64rem;
      line-height: 1.35;
    }

    .shortcut-help {
      margin: 0 0 0.5rem;
    }

    .status {
      min-height: 1.15rem;
      margin: 0.35rem 0;
      padding: 0.25rem 0.45rem;
      border-radius: 0.3rem;
      color: #1e4f87;
      background: #e6f1ff;
      font-size: 0.65rem;
      line-height: 1.25;
    }

    .status[data-error] {
      color: #9a3412;
      background: #fff0e8;
    }

    .commands-heading, .cloud-heading, .editor-heading {
      margin: 1.5rem 0 0.5rem;
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .settings-panel > :first-child {
      margin-top: 0;
    }

    .command-section + .command-section {
      margin-top: 0.32rem;
    }

    .command-list {
      display: grid;
      gap: 0.32rem;
    }

    .command-category {
      margin-top: 0.5rem;
    }

    .command-category summary {
      padding: 0.5rem 0.2rem;
      color: #202a36;
      font-size: 0.72rem;
      font-weight: 700;
      cursor: pointer;
    }

    .command-row {
      display: grid;
      grid-template-columns: minmax(9rem, 1fr) minmax(10rem, 0.8fr);
      align-items: stretch;
      gap: 0.5rem;
    }

    .command-details {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-rows: auto auto;
      align-content: center;
      gap: 0.05rem 0.45rem;
      min-width: 0;
      padding: 0.3rem 0.2rem;
    }

    .command-icon {
      grid-row: 1 / 3;
      align-self: center;
    }

    .command-label {
      overflow: hidden;
      color: #202a36;
      font-size: 0.7rem;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .command-description {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .shortcut-button {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      min-height: 2.6rem;
      padding: 0.35rem 0.5rem;
      border: 1px solid #aeb8c4;
      border-radius: 0.3rem;
      color: #2f3742;
      background: #f7f8fa;
      font: inherit;
      cursor: pointer;
    }

    .shortcut-button:hover,
    .shortcut-button[data-recording] {
      border-color: #3977c7;
      color: #1e4f87;
      background: #e8f2fd;
    }

    .command-category summary:focus-visible,
    .shortcut-button:focus-visible,
    select:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }

    kbd {
      min-width: 1rem;
      padding: 0.12rem 0.3rem;
      border: 1px solid #ccd3dc;
      border-bottom-width: 2px;
      border-radius: 0.25rem;
      color: inherit;
      background: #ffffff;
      box-shadow: 0 1px 0 rgb(0 0 0 / 6%);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.64rem;
      font-weight: 650;
      white-space: nowrap;
    }

    .shortcut-empty,
    .shortcut-recording {
      color: #687383;
      font-size: 0.66rem;
      font-weight: 600;
    }

    @media (max-width: 34rem) {
      .command-row {
        grid-template-columns: minmax(0, 1fr);
        gap: 0.1rem;
      }

      .shortcut-button {
        min-height: 2.1rem;
      }
    }
  `

  settings: AppSettings = defaultAppSettings()
  private recordingCommandId = ""
  private message = ""
  private error = ""
  private signingIn = ""
  private cloudError = ""
  private providerType: CloudService["type"] | null = null
  private signInController: AbortController | null = null

  disconnectedCallback() {
    const licenses = this.renderRoot.querySelector<HTMLDialogElement>("#licenses-dialog")
    if(licenses?.open) licenses.close()
    this.signInController?.abort()
    this.signingIn = ""
    this.providerType = null
    this.renderRoot.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => {input.value = ""})
    super.disconnectedCallback()
  }

  private changeCloudServices(cloudServices: CloudService[], activeCloudServiceId = this.settings.activeCloudServiceId) {
    this.emitSettings({...this.settings, cloudServices, activeCloudServiceId, cloudServicesConfigured: true})
  }

  private async chooseProvider(type: CloudService["type"] | null) {
    this.cloudError = ""
    this.providerType = type
    await this.updateComplete
    this.renderRoot.querySelector<HTMLInputElement>('.new-provider input')?.focus()
  }

  private async addCloudService(event: SubmitEvent) {
    event.preventDefault()
    if(!this.providerType || this.signingIn) return
    const form = event.currentTarget as HTMLFormElement
    try {
      const type = this.providerType
      const url = cloudServiceURL(type === "edumix" ? EDUMIX_URL : form.querySelector<HTMLInputElement>('[name="url"]')!.value.trim())
      const service = {id: crypto.randomUUID(), type, url, username: form.querySelector<HTMLInputElement>('[name="username"]')!.value.trim()}
      this.changeCloudServices([...this.settings.cloudServices, service])
      this.cloudError = ""
      this.providerType = null
      await this.signIn(service, event)
    }
    catch(error) {this.cloudError = error instanceof Error ? error.message : String(error)}
  }

  private renderProviderIcon(type: CloudService["type"]) {
    return type === "edumix" ? html`<img class="provider-icon" src=${appIconUrl} alt="">`
      : html`<span class="provider-icon" aria-hidden="true">${ribbonIcon("Cloud")}</span>`
  }

  private renderCredentials(service?: CloudService) {
    return html`
      <label class="setting-label">Username
        <input name="username" autocomplete="username" aria-label=${service ? `Username for ${service.url}` : "Username"}
          ?required=${service?.authentication !== "none"} .value=${service?.username ?? ""}
          @input=${(event: Event) => service && this.changeCloudServices(this.settings.cloudServices.map(value => value.id === service.id
            ? {...value, username: (event.currentTarget as HTMLInputElement).value, accessToken: undefined, expiresAt: undefined} : value))}>
      </label>
      ${service?.authentication !== "none" ? html`<label class="setting-label">Password
        <input name="password" type="password" autocomplete="current-password" aria-label=${service ? `Password for ${service.url}` : "Password"} required>
      </label>` : ""}`
  }

  private async signIn(service: CloudService, event: SubmitEvent) {
    event.preventDefault()
    if(this.signingIn) return
    const form = event.currentTarget as HTMLFormElement
    const password = form.querySelector<HTMLInputElement>('input[type="password"]')!
    const controller = new AbortController()
    this.signInController = controller
    this.signingIn = service.id
    this.cloudError = ""
    try {
      const result = await connectCloudService(service, {password: password.value, signal: controller.signal})
      if(controller.signal.aborted || !this.isConnected
        || this.settings.cloudServices.find(value => value.id === service.id) !== service) return
      this.changeCloudServices(this.settings.cloudServices.map(value => value.id === service.id ? result.service : value), service.id)
    }
    catch(error) {if(!controller.signal.aborted) this.cloudError = error instanceof Error ? error.message : String(error)}
    finally {
      password.value = ""
      if(this.signInController === controller) {
        this.signInController = null
        this.signingIn = ""
      }
    }
  }

  private renderCloudSettings() {
    return html`<section class="setting-card" aria-label="Identity and cloud services">
      <h2 class="cloud-heading">Cloud services</h2>
      <div class="local-settings">
        <label class="setting-label"><input type="radio" name="active-cloud" .checked=${!this.settings.activeCloudServiceId}
          @change=${() => this.changeCloudServices(this.settings.cloudServices, null)}> Local</label>
        <input id="local-username" aria-label="Local username" placeholder="Username" autocomplete="nickname"
          ?disabled=${Boolean(this.settings.activeCloudServiceId)} .value=${this.settings.localUsername}
          @input=${(event: Event) => this.emitSettings({...this.settings, localUsername: (event.currentTarget as HTMLInputElement).value})}>
      </div>
      ${repeat(this.settings.cloudServices, service => service.id, service => html`<div class="cloud-service" ?data-active=${this.settings.activeCloudServiceId === service.id}>
        <button class="cloud-remove" type="button" aria-label=${`Remove ${service.type === "edumix" ? "edumix.eu" : service.url}`}
          title="Remove provider" @click=${() => this.changeCloudServices(
            this.settings.cloudServices.filter(value => value.id !== service.id), this.settings.activeCloudServiceId === service.id ? null : this.settings.activeCloudServiceId)}>×</button>
        <label class="setting-label cloud-service-header"><input type="radio" name="active-cloud"
          .checked=${this.settings.activeCloudServiceId === service.id}
          @change=${() => this.changeCloudServices(this.settings.cloudServices, service.id)}>
          ${this.renderProviderIcon(service.type)}
          ${service.type === "edumix" ? "edumix.eu" : service.url}</label>
        ${service.authentication === "none" ? html`
          <p class="setting-description">Available on this host · no sign-in required</p>
          <div class="cloud-identity">${this.renderCredentials(service)}</div>` : html`
          <form @submit=${(event: SubmitEvent) => this.signIn(service, event)}>
            ${this.renderCredentials(service)}
            <p class="setting-description">${cloudServiceExpired(service) ? "Session expired. Sign in again."
              : service.accessToken ? "Signed in" : "Sign in to connect."}</p>
            <div class="cloud-actions"><button class="cloud-button primary" type="submit" ?disabled=${Boolean(this.signingIn)}>
              ${this.signingIn === service.id ? "Signing in…" : "Sign in"}</button>
              ${service.accessToken ? html`<button class="cloud-button" type="button" @click=${() => this.changeCloudServices(this.settings.cloudServices.map(value => value.id === service.id
                ? {...value, accessToken: undefined, expiresAt: undefined} : value))}>Sign out</button>` : ""}
            </div>
          </form>`}
      </div>`)}
      <p class="setting-label add-provider-label">Add a cloud service</p>
      <div class="provider-types" role="group" aria-label="Provider type">
        <button type="button" aria-pressed=${this.providerType === "edumix"} aria-controls="new-cloud-provider"
          ?disabled=${Boolean(this.signingIn)} @click=${() => this.chooseProvider("edumix")}>${this.renderProviderIcon("edumix")}edumix.eu</button>
        <button type="button" aria-pressed=${this.providerType === "url"} aria-controls="new-cloud-provider"
          ?disabled=${Boolean(this.signingIn)} @click=${() => this.chooseProvider("url")}>${this.renderProviderIcon("url")}Custom provider</button>
      </div>
      <div id="new-cloud-provider">
        ${this.providerType ? keyed(this.providerType, html`<form class="new-provider" @submit=${this.addCloudService}>
          ${this.providerType === "url" ? html`<label class="setting-label">Provider URL
            <input name="url" type="url" aria-label="Provider URL" placeholder="https://cloud.example.org" required>
          </label>` : ""}
          ${this.renderCredentials()}
          <div class="cloud-actions">
            <button class="cloud-button primary" type="submit">Sign in</button>
            <button class="cloud-button" type="button" @click=${() => this.chooseProvider(null)}>Cancel</button>
          </div>
        </form>`) : ""}
      </div>
      ${this.cloudError ? html`<div class="status" data-error role="alert">${this.cloudError}</div>` : ""}
    </section>`
  }

  private emitSettings(settings: AppSettings) {
    this.settings = settings
    this.dispatchEvent(new CustomEvent<AppSettings>("settings-change", {
      detail: settings,
      bubbles: true,
      composed: true,
    }))
  }

  private changeLanguage(event: Event) {
    this.message = ""
    this.error = ""
    this.emitSettings({...this.settings, language: (event.currentTarget as HTMLSelectElement).value})
  }

  private changeDefaultLayout(event: Event) {
    const mode = (event.currentTarget as HTMLSelectElement).value
    if(mode !== "document" && mode !== "canvas" && mode !== "slides") return
    this.emitSettings({...this.settings, defaultLayout: mode})
  }

  private changeDocumentLanguageUpdate(event: Event) {
    this.message = ""
    this.error = ""
    this.emitSettings({
      ...this.settings,
      updateDocumentLanguage: (event.currentTarget as HTMLInputElement).checked,
    })
  }

  private changeDisableAnimations(event: Event) {
    this.emitSettings({
      ...this.settings,
      disableAnimations: (event.currentTarget as HTMLInputElement).checked,
    })
  }

  private startRecording(commandId: string) {
    this.recordingCommandId = commandId
    this.message = "Press a new shortcut. Escape cancels; Backspace removes it."
    this.error = ""
  }

  private recordShortcut(commandId: string, event: KeyboardEvent) {
    if(this.recordingCommandId !== commandId) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if(event.key === "Escape") {
      this.recordingCommandId = ""
      this.message = "Shortcut change cancelled."
      this.error = ""
      return
    }
    if(event.key === "Backspace" || event.key === "Delete") {
      this.emitSettings({
        ...this.settings,
        shortcuts: {...this.settings.shortcuts, [commandId]: ""},
      })
      this.recordingCommandId = ""
      this.message = "Shortcut removed."
      this.error = ""
      return
    }

    const shortcut = shortcutFromEvent(event)
    if(!shortcut) {
      this.error = "Include Control, Command, Alt, or use a function key."
      return
    }
    const reserved = reservedShortcutReason(shortcut)
    if(reserved) {
      this.error = reserved
      return
    }

    const previous = this.settings.shortcuts[commandId] ?? ""
    const conflict = appCommands.find(command => (
      command.id !== commandId && this.settings.shortcuts[command.id] === shortcut
    ))
    const shortcuts = {...this.settings.shortcuts, [commandId]: shortcut}
    if(conflict) shortcuts[conflict.id] = previous
    this.emitSettings({...this.settings, shortcuts})
    this.recordingCommandId = ""
    this.error = ""
    this.message = conflict
      ? `${conflict.label} was using that shortcut, so the two shortcuts were swapped.`
      : "Shortcut updated."
  }

  resetSettings() {
    this.providerType = null
    this.recordingCommandId = ""
    this.error = ""
    this.message = "Settings reset to their defaults."
    this.emitSettings(defaultAppSettings())
  }

  private renderShortcut(commandId: string) {
    if(this.recordingCommandId === commandId) {
      return html`<span class="shortcut-recording">Press shortcut…</span>`
    }
    const shortcut = this.settings.shortcuts[commandId] ?? ""
    return shortcut
      ? shortcutParts(shortcut).map(part => html`<kbd>${part}</kbd>`)
      : html`<span class="shortcut-empty">Not set</span>`
  }

  protected updated() {
    const language = this.renderRoot.querySelector<HTMLSelectElement>('select[aria-label="Interface language"]')
    if(language && language.value !== this.settings.language) language.value = this.settings.language
    const layout = this.renderRoot.querySelector<HTMLSelectElement>("#default-layout")
    if(layout && layout.value !== this.settings.defaultLayout) layout.value = this.settings.defaultLayout
  }

  private renderCommands(section: AppCommand["section"]) {
    return html`
      <div class="command-list">
        ${appCommands.filter(command => command.section === section).map(command => html`
          <div class="command-row">
            <div class="command-details">
              <span class="command-icon" aria-hidden="true">${ribbonIcon(command.icon)}</span>
              <span class="command-label">${command.label}</span>
              <span class="command-description">${command.description}</span>
            </div>
            <button
              class="shortcut-button"
              type="button"
              aria-label=${`Configure shortcut for ${command.label}`}
              aria-pressed=${this.recordingCommandId === command.id}
              ?data-recording=${this.recordingCommandId === command.id}
              @click=${() => this.startRecording(command.id)}
              @keydown=${(event: KeyboardEvent) => this.recordShortcut(command.id, event)}
            >${this.renderShortcut(command.id)}</button>
          </div>
        `)}
      </div>
    `
  }

  render() {
    const sections = ["Document", "Editor", "Text", "Insert"] as const
    const elementSections = ["Table", "Graphic"] as const
    return html`
      <div class="settings-panel">
        <h2 class="editor-heading">Editor</h2>
        <section class="setting-card" aria-label="Language">
          <select aria-label="Interface language" .value=${this.settings.language} @change=${this.changeLanguage}>
            ${languageOptions.map(option => html`
              <option value=${option.value} ?selected=${option.value === this.settings.language}>${option.label}</option>
            `)}
          </select>
          <p class="setting-description">Language for the WebWriter interface and new documents</p>
          <label class="checkbox-setting">
            <input
              type="checkbox"
              .checked=${this.settings.updateDocumentLanguage}
              @change=${this.changeDocumentLanguageUpdate}
            />
            <span class="checkbox-label">Update language across document</span>
            <span class="checkbox-description">When the language changes, update the active document language so its content and widgets inherit it.</span>
          </label>
        </section>

        <section class="setting-card" aria-label="New documents">
          <label class="setting-label" for="default-layout">Default layout</label>
          <select id="default-layout" .value=${this.settings.defaultLayout} @change=${this.changeDefaultLayout}>
            ${documentLayoutModes.map(mode => html`<option value=${mode}>${documentLayoutLabel(mode)}</option>`)}
          </select>
          <p class="setting-description">Layout used when creating a new document.</p>
        </section>

        <section class="setting-card" aria-label="Toolbox">
          <label class="checkbox-setting">
            <input
              type="checkbox"
              .checked=${this.settings.showStyleToolbox}
              @change=${(event: Event) => this.emitSettings({...this.settings, showStyleToolbox: (event.currentTarget as HTMLInputElement).checked})}
            />
            <span class="checkbox-label">Show style toolbox</span>
            <span class="checkbox-description">Show the Style tab to edit the selected element’s CSS properties.</span>
          </label>
        </section>

        <section class="setting-card" aria-label="AI">
          <label class="checkbox-setting">
            <input type="checkbox" .checked=${this.settings.disableAI}
              @change=${(event: Event) => this.emitSettings({...this.settings, disableAI: (event.currentTarget as HTMLInputElement).checked})}
            />
            <span class="checkbox-label">Disable AI</span>
            <span class="checkbox-description">Hide the AI bar and AI toolbox tab.</span>
          </label>
        </section>

        <section class="setting-card" aria-label="Motion">
          <label class="checkbox-setting">
            <input
              type="checkbox"
              .checked=${this.settings.disableAnimations}
              @change=${this.changeDisableAnimations}
            />
            <span class="checkbox-label">Disable animations and transitions</span>
            <span class="checkbox-description">Make the editing interface respond instantly, including menus, panels, and selection indicators.</span>
          </label>
        </section>

        <details class="command-category developer-settings">
          <summary>Developer settings</summary>
          <section class="setting-card" aria-label="Developer console">
            <label class="checkbox-setting">
              <input type="checkbox" .checked=${this.settings.pinDeveloperConsole}
                @change=${(event: Event) => this.emitSettings({...this.settings, pinDeveloperConsole: (event.currentTarget as HTMLInputElement).checked})}
              />
              <span class="checkbox-label">Pin developer console</span>
              <span class="checkbox-description">Keep the developer console open when switching tools and after reloading.</span>
            </label>
            <label class="checkbox-setting">
              <input type="checkbox" .checked=${this.settings.autoReloadPackages}
                @change=${(event: Event) => this.emitSettings({...this.settings, autoReloadPackages: (event.currentTarget as HTMLInputElement).checked})}
              />
              <span class="checkbox-label">Auto-reload packages</span>
              <span class="checkbox-description">Reload installed local packages when their files change.</span>
            </label>
            <label class="checkbox-setting">
              <input type="checkbox" .checked=${this.settings.autosaveCloudOnBundleChange}
                @change=${(event: Event) => this.emitSettings({...this.settings, autosaveCloudOnBundleChange: (event.currentTarget as HTMLInputElement).checked})}
              />
              <span class="checkbox-label">Autosave cloud on bundle change</span>
              <span class="checkbox-description">Advanced: When a bundle inside a package changes and a cloud-saved document is open, automatically save that document (use to debug on remote devices, e.g. mobile).</span>
            </label>
          </section>
        </details>

        ${this.renderCloudSettings()}
        <h3 class="commands-heading">Commands</h3>
        <p class="shortcut-help">Select a shortcut, then press its replacement. Reserved system and browser shortcuts cannot be assigned.</p>
        ${this.message || this.error ? html`
          <div class="status" role="status" aria-live="polite" ?data-error=${Boolean(this.error)}>
            ${this.error || this.message}
          </div>
        ` : ""}
        ${sections.map(section => html`
          <section class="command-section" aria-label=${`${section} commands`}>
            ${this.renderCommands(section)}
          </section>
        `)}
        ${elementSections.map(section => html`
          <details class="command-category">
            <summary>${section} commands</summary>
            ${this.renderCommands(section)}
          </details>
        `)}
        <button class="licenses-link" type="button" aria-haspopup="dialog" aria-controls="licenses-dialog"
          @click=${() => this.renderRoot.querySelector<HTMLDialogElement>("#licenses-dialog")?.showModal()}
        >View licenses of components</button>
      </div>
      <dialog id="licenses-dialog" aria-labelledby="licenses-title">
        <header>
          <h2 id="licenses-title">Licenses of components</h2>
          <button class="cloud-button" type="button" aria-label="Close licenses"
            @click=${() => this.renderRoot.querySelector<HTMLDialogElement>("#licenses-dialog")?.close()}
          >Close</button>
        </header>
        <pre>${componentLicenses}</pre>
      </dialog>
    `
  }
}

if(!customElements.get("settings-panel")) {
  customElements.define("settings-panel", SettingsPanel)
}

declare global {
  interface HTMLElementTagNameMap {
    "settings-panel": SettingsPanel
  }
}
