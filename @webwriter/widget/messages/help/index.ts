import {defineMessages} from "../../messages.js"
import catalogs from "./catalogs.js"

/** The texts of Help. */
export type HelpMessages = {
  /** Name of the numbered list that replaces the labels in a small widget. */
  list: string
}

/** The messages of Help with their catalogs. */
export const helpMessages = defineMessages<HelpMessages>({list: "Help"}, catalogs)
