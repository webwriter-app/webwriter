import {LitElement, css, html} from "lit"
import {
  appCommands,
  defaultAppSettings,
  reservedShortcutReason,
  shortcutFromEvent,
  shortcutParts,
  type AppSettings,
} from "../app-settings"
import {documentLanguages} from "../document-languages"
import {ribbonIcon} from "../ribbon-icons"

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
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
      color: #2f3742;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .settings-panel {
      box-sizing: border-box;
      height: 100%;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      padding: 0.75rem 0.85rem 1rem;
      scrollbar-color: #b8c1cc transparent;
      scrollbar-width: thin;
    }

    .settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }

    h2,
    h3 {
      margin: 0;
      color: #202a36;
      line-height: 1.2;
    }

    h2 {
      font-size: 1rem;
    }

    h3 {
      margin: 1.1rem 0 0.45rem;
      font-size: 0.8rem;
    }

    .reset-button {
      min-height: 1.8rem;
      padding: 0.25rem 0.55rem;
      border: 1px solid #c4ccd6;
      border-radius: 0.35rem;
      color: #465465;
      background: #ffffff;
      font: inherit;
      font-size: 0.67rem;
      cursor: pointer;
    }

    .reset-button:hover {
      border-color: #8eb6df;
      color: #1e4f87;
      background: #eef4fb;
    }

    .setting-card {
      padding: 0.7rem;
      border: 1px solid #d5dce5;
      border-radius: 0.5rem;
      background: #ffffff;
    }

    .setting-title {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.4rem;
      color: #202a36;
      font-size: 0.76rem;
      font-weight: 700;
    }

    .setting-icon,
    .command-icon {
      display: block;
      flex: 0 0 auto;
      width: 1rem;
      height: 1rem;
      color: #526b86;
    }

    .setting-icon svg,
    .command-icon svg {
      display: block;
      width: 100%;
      height: 100%;
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

    .command-list {
      display: grid;
      gap: 0.32rem;
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

    .shortcut-button:focus-visible,
    .reset-button:focus-visible,
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

  private changeDocumentLanguageUpdate(event: Event) {
    this.message = ""
    this.error = ""
    this.emitSettings({
      ...this.settings,
      updateDocumentLanguage: (event.currentTarget as HTMLInputElement).checked,
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

  private resetSettings() {
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
  }

  render() {
    const sections = ["Document", "Editor", "Text", "Insert", "Table", "Graphic"] as const
    return html`
      <div class="settings-panel">
        <header class="settings-header">
          <h2>Settings</h2>
          <button class="reset-button" type="button" @click=${this.resetSettings}>Reset settings</button>
        </header>

        <section class="setting-card" aria-labelledby="language-setting-heading">
          <div id="language-setting-heading" class="setting-title">
            <span class="setting-icon" aria-hidden="true">${ribbonIcon("Language")}</span>
            <span>Language</span>
          </div>
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

        <h3>Keyboard shortcuts</h3>
        <p class="shortcut-help">Select a shortcut, then press its replacement. Reserved system and browser shortcuts cannot be assigned.</p>
        ${this.message || this.error ? html`
          <div class="status" role="status" aria-live="polite" ?data-error=${Boolean(this.error)}>
            ${this.error || this.message}
          </div>
        ` : ""}
        ${sections.map(section => html`
          <section aria-labelledby=${`commands-${section.toLocaleLowerCase()}`}>
            <h3 id=${`commands-${section.toLocaleLowerCase()}`}>${section}</h3>
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
          </section>
        `)}
      </div>
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
