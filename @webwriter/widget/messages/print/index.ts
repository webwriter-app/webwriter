import {defineMessages} from "../../messages.js"
import catalogs from "./catalogs.js"

/** What the print note says. The defaults are English. */
export type PrintMessages = {
  /** Printed in place of interactive content that has no print view. The address of the document follows it, if there is one. */
  note: string
}

/** The print note's messages with their catalogs. */
export const printMessages = defineMessages<PrintMessages>(
  {
    note: "This interactive content is not shown on paper. Open the document online to use it.",
  },
  catalogs,
)
