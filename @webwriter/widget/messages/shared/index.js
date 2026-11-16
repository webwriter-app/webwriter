import { defineMessages } from "../../messages.js";
import catalogs from "./catalogs.js";
const sharedMessages = defineMessages(
  {
    cancelled: "Cancelled.",
    notAllowed: "Cancelled. This is no longer allowed here."
  },
  catalogs
);
export {
  sharedMessages
};
