import { defineMessages } from "../../messages.js";
import catalogs from "./catalogs.js";
const viewportMessages = defineMessages(
  {
    viewport: "Viewport",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    percent: (percent) => `${percent}%`,
    reset: (percent) => `Zoom ${percent}%. Reset to 100%`,
    fit: "Fit to view"
  },
  catalogs
);
export {
  viewportMessages
};
