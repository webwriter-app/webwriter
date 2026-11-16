import type {ShortcutsCore, ShortcutsOptions} from "@webwriter/widget/shortcuts"
import type {CoreStore} from "./base.js"

export type {ShortcutAction, ShortcutsMessages, ShortcutsOptions, ShortcutsSnapshot} from "@webwriter/widget/shortcuts"

export type ShortcutsStore = CoreStore<ShortcutsCore> & Pick<ShortcutsCore, "keysOf" | "labelsOf">

export function shortcutsStore(host: HTMLElement, options?: ShortcutsOptions): ShortcutsStore
