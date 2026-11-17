import { defineMessages } from "../../messages.js";
import catalogs from "./catalogs.js";
const printMessages = defineMessages(
  {
    note: "This interactive content is not shown on paper. Open the document online to use it."
  },
  catalogs
);
export {
  printMessages
};
