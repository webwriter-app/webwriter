import { defineMessages } from "../../messages.js";
import catalogs from "./catalogs.js";
const playbackMessages = defineMessages(
  {
    play: "Play",
    pause: "Pause",
    step: "Step forward",
    back: "Step back",
    reset: "Reset",
    seek: "Position",
    rate: (_rate, shown) => `Speed: ${shown}×`
  },
  catalogs
);
export {
  playbackMessages
};
