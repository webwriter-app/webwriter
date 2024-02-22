import { LitElement, html, css } from "lit"
import { ViewModelMixin } from "../../viewmodel"
import { localized, msg } from "@lit/localize"
import { customElement, property } from "lit/decorators.js"
import {version} from "../../package.json"

export * from "./configurator"
export * from "./packagemanager"
export * from "./keymapmanager"

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
    this.latestVersion = await this.environment.api.checkUpdate()
  }

  @property({type: Object, attribute: false})
  latestVersion: {date?: string, version?: string}

	PackageManager = () => {
		const {packagesList, adding, removing, updating, loading, resetting, add, remove, update, load, viewAppDir, watching, open} = this.store.packages
		const {setAndPersist} = this.settings

		return html`<ww-package-manager
      .app=${this}
			slot="pre-tab-panel-a"
      .store=${this.store}
			.packages=${packagesList}
			?loading=${loading}
			?resetting=${resetting}
			@ww-add-package=${(e: any) => add(e.detail.args)}
			@ww-remove-package=${(e: any) => remove(e.detail.args)}
      @ww-edit-package=${(e: any) => e} 
      @ww-open-package-code=${(e: any) => open(e.detail.name)} 
			@ww-toggle-watch=${(e: any) => setAndPersist("packages", "watching", {...watching, [e.detail.name]: !watching[e.detail.name]})}
			@ww-refresh=${() => load()}
			@ww-open-app-dir=${() => viewAppDir()}></ww-package-manager>
		</ww-package-manager>`
	}

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

  render() {
    if(!this.settings || !this.store) {
      return null
    }
		const {specs, values, specLabels, setAndPersist} = this.settings
		const {viewAppDir} = this.store.packages
		return html`
			<ww-configurator
        .app=${this}
				.specs=${specs}
				.specLabels=${specLabels}
				.values=${values}
				@ww-change=${(e: any) => setAndPersist(e.detail.groupKey, e.detail.key, e.detail.value)}
			>
				<span slot="post-tab-a">
					<span>${msg("Shortcuts")}</span>
				</span>
				${this.KeymapManager()}
        <div class="version-info" slot="post-tabs">
          <b>WebWriter</b>
          <code>${version}</code></div>
        <ww-button size="small" slot="post-tabs" variant="warning" outline class="title-button" @click=${() => this.environment.api.installUpdate()} title=${this.latestVersion?.version? this.latestVersion.date!: msg("You have the latest version of WebWriter.")} ?disabled=${!this.latestVersion?.version} ?loading=${!this.latestVersion}>
          <span>${this.latestVersion?.version? msg("Update to"): msg("Up to date")}</span>
          <code>${this.latestVersion?.version}</code>
        </ww-button>
        <ww-button size="small" slot="post-tabs" variant="danger" outline class="title-button" confirm>
        <span>${msg("Reset WebWriter")}</span>
          <span slot="confirm">${msg("Are you sure? This action can't be reversed, all your settings will be deleted and reset.")}</span>
        </ww-button>
      <ww-button size="small" slot="post-tabs" variant="neutral" outline class="title-button" @click=${() => viewAppDir()}>
        <span>${msg("App Folder")}</span>
      </ww-button>
			</ww-configurator>
		`
	}
}