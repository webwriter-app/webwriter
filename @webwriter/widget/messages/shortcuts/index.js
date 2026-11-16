import { defineMessages } from "../../messages.js";
import catalogs from "./catalogs.js";
const shortcutsMessages = defineMessages(
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
    pageDown: "Page Down"
  },
  catalogs
);
export {
  shortcutsMessages
};
