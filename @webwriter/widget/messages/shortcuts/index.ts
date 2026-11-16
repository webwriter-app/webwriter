import {defineMessages} from "../../messages.js"
import catalogs from "./catalogs.js"

/** The names of keys, as `labelsOf()` shows them where a key has no symbol. */
export type ShortcutsMessages = {
  control: string
  alt: string
  shift: string
  meta: string
  space: string
  enter: string
  escape: string
  tab: string
  backspace: string
  delete: string
  insert: string
  home: string
  end: string
  pageUp: string
  pageDown: string
}

/** The key names of Shortcuts with their catalogs. */
export const shortcutsMessages = defineMessages<ShortcutsMessages>(
  {
    control: "Ctrl",
    alt: "Alt",
    shift: "Shift",
    meta: "Meta",
    space: "Space",
    enter: "Enter",
    escape: "Esc",
    tab: "Tab",
    backspace: "Backspace",
    delete: "Delete",
    insert: "Insert",
    home: "Home",
    end: "End",
    pageUp: "Page Up",
    pageDown: "Page Down",
  },
  catalogs,
)
