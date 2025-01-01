import { LitElement, html, css } from "lit"
import { SettingsController, ViewModelMixin } from "#viewmodel"
import { localized, msg } from "@lit/localize"
import { customElement, property } from "lit/decorators.js"
import {version} from "../../../package.json"

export * from "./configurator"
export * from "./keymapmanager"
export * from "./accountmanager"
export * from "./accountform"

@localized()
@customElement("ww-settings")
export class Settings extends ViewModelMixin(LitElement, true) {

  static styles = css`
    .version-info {
      display: flex;
      flex-direction: column;
      font-size: 0.7rem;
      align-items: center;
      justify-content: center;
    }

    .version-info > b {
      user-select: none;
    }
  `

  async connectedCallback() {
    await super.connectedCallback()
    await this.initialized
		this.localization.setLocale(this.store.ui.locale)
  }

  @property({type: Object, attribute: false})
  latestVersion: {date?: string, version?: string}

	KeymapManager = () => {
		const {commands, categoryLabels} = this.commands
		const {setAndPersist} = this.settings
		return html`<ww-keymap-manager
      .app=${this}
			slot="post-tab-panel-a"
			.commands=${commands}
			.categoryLabels=${categoryLabels}
			@ww-shortcut-change=${(e: CustomEvent) => {
				const {name, shortcut} = e.detail
				const customKeymap = this.store.get("ui", "keymap")
        const command = (commands as any)[name]
				setAndPersist("ui", "keymap", {...customKeymap, [name]: {shortcut}})
        command.shortcut = shortcut
			}}
			@ww-shortcut-reset=${(e: CustomEvent) => {
				const {name} = e.detail
				const customKeymap = {...this.store.get("ui", "keymap")}
        const command = (commands as any)[name]
        delete customKeymap[name]
				setAndPersist("ui", "keymap", customKeymap)
        command.shortcut = command.spec.shortcut
			}}
		></ww-keymap-manager>`
	}

  AccountManager = () => {
    return html`<ww-account-manager slot="post-tab-panel-b" .app=${this}></ww-account-manager>`
  }

  render() {
    if(!this.settings || !this.store) {
      return null
    }
		const {values, setAndPersist} = this.settings
    const {specs, specLabels} = SettingsController
    const postTabsButtons = WEBWRITER_ENVIRONMENT.backend !== "tauri"? null:  html`
      <ww-button size="small" slot="post-tabs" variant="warning" outline class="title-button" title=${this.latestVersion?.version? this.latestVersion.date!: msg("You have the latest version of WebWriter.")} ?disabled=${!this.latestVersion?.version} ?loading=${!this.latestVersion}>
      <span>${this.latestVersion?.version? msg("Update to"): msg("Up to date")}</span>
      <code>${this.latestVersion?.version}</code>
    </ww-button>
    <ww-button size="small" slot="post-tabs" variant="danger" outline class="title-button" confirm>
    <span>${msg("Reset WebWriter")}</span>
      <span slot="confirm">${msg("Are you sure? This action can't be reversed, all your settings will be deleted and reset.")}</span>
    </ww-button>
    `
		return html`
			<ww-configurator
        .app=${this}
				.specs=${specs}
				.specLabels=${specLabels}
				.values=${values}
				@ww-change=${(e: any) => {setAndPersist(e.detail.groupKey, e.detail.key, e.detail.value); this.localization.setLocale(this.store.ui.locale)}}
			>
				<span slot="post-tab-a">
					<span>${msg("Shortcuts")}</span>
				</span>
				${this.KeymapManager()}
        <span slot="post-tab-b">
					<span>${msg("Accounts")}</span>
				</span>
        ${this.AccountManager()}
        <div class="version-info" slot="post-tabs">
          <b>WebWriter</b>
          <code>${version}</code>
        </div>
        ${postTabsButtons}
			</ww-configurator>
		`
	}
}