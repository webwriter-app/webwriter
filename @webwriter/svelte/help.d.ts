import type {HelpCore, HelpOptions} from "@webwriter/widget/help"
import type {CoreStore} from "./base.js"

export type {HelpMessages, HelpOptions, HelpSnapshot} from "@webwriter/widget/help"

export type HelpStore = CoreStore<HelpCore> & Pick<HelpCore, "toggle" | "close">

export function helpStore(host: HTMLElement, options?: HelpOptions): HelpStore
