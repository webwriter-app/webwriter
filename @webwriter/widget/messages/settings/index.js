import { defineMessages } from "../../messages.js";
import catalogs from "./catalogs.js";
const settingsMessages = defineMessages(
  {
    invalid: "This value is not allowed here.",
    invalidDuration: "Enter a duration, for example 1:30 or 90."
  },
  catalogs
);
export {
  settingsMessages
};
