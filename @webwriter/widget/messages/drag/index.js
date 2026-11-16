import { defineMessages } from "../../messages.js";
import catalogs from "./catalogs.js";
const dragMessages = defineMessages(
  {
    picked: (item) => `Picked up ${item}. Use the arrow keys to choose a place, Enter to drop, Escape to cancel.`,
    pickedLink: (item) => `Linking ${item}. Use the arrow keys to choose what to link it to, Enter to link, Escape to cancel.`,
    selected: (item) => `Selected ${item}. Click where it should go, or click it again to cancel.`,
    nextTarget: "Tab moves to the next target.",
    over: (target, position) => position ? `${target ? `${target}, ` : ""}position ${position.index} of ${position.count}` : target,
    at: (target, x, y) => `${target ? `${target}, ` : ""}${x} from the left, ${y} from the top`,
    dropped: (item, target) => target ? `Dropped ${item} on ${target}.` : `Dropped ${item}.`,
    copied: (item, target) => target ? `Added ${item} to ${target}.` : `Added ${item}.`,
    linked: (item, target) => `Linked ${item} to ${target}.`,
    // The words of the shared messages, written out: a catalog of Drag is complete without a second file.
    cancelled: () => "Cancelled.",
    notAllowed: "Cancelled. This is no longer allowed here."
  },
  catalogs
);
export {
  dragMessages
};
