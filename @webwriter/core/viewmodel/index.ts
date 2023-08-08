import { LitElement } from "lit"

export * from "./commandcontroller"
export * from "./localizationcontroller"
export * from "./notificationcontroller"
export * from "./settingscontroller"
export * from "./storecontroller"
export * from "./environmentcontroller"
export * from "./iconcontroller"

import {StoreController, EnvironmentController, CommandController, LocalizationController, NotificationController, SettingsController, IconController} from "."
import { RootStore } from "../model"

const CORE_PACKAGES = ["@webwriter/ww-textarea", "@webwriter/ww-figure", "@open-wc/scoped-elements"]

type LitElementConstructor = typeof LitElement
export const ViewModelMixin = (cls: LitElementConstructor) => class extends cls {
	store: StoreController
	environment: EnvironmentController
	commands: CommandController
	localization: LocalizationController
	notifications: NotificationController
	settings: SettingsController
  icons: IconController

	async connectedCallback() {
		super.connectedCallback()
		this.environment = new EnvironmentController(this)
		await this.environment.apiReady
		this.store = StoreController(new RootStore({corePackages: CORE_PACKAGES, ...this.environment.api}), this)
    this.icons = new IconController(this)
		this.localization = new LocalizationController(this, this.store)
    this.commands = new CommandController(this as any, this.store)
		this.notifications = new NotificationController(this, this.store)
		this.settings = new SettingsController(this, this.store)
    await this.store.packages.initialized
    this.store.resources.create()
	}
}