import {defineMessages} from "../../messages.js"
import catalogs from "./catalogs.js"

/** The texts Drag speaks. */
export type DragMessages = {
  /** Pick-up with the keyboard. */
  picked: (item: string) => string
  /** Pick-up of a link with the keyboard. */
  pickedLink: (item: string) => string
  /** Pick-up with a click. */
  selected: (item: string) => string
  /** Added to the pick-up when arrow keys move the item inside a target and other targets exist. */
  nextTarget: string
  /** A target, or a place in an index target: `position` is given then. */
  over: (target: string, position?: {index: number; count: number}) => string
  /** A point in a point target. */
  at: (target: string, x: number, y: number) => string
  dropped: (item: string, target: string) => string
  /** A drop with the `copy` effect. */
  copied: (item: string, target: string) => string
  /** A drop with the `link` effect. */
  linked: (item: string, target: string) => string
  cancelled: () => string
  /** The interaction was ended because `can` turned false. */
  notAllowed: string
}

/** The messages of Drag with their catalogs. */
export const dragMessages = defineMessages<DragMessages>(
  {
    picked: item => `Picked up ${item}. Use the arrow keys to choose a place, Enter to drop, Escape to cancel.`,
    pickedLink: item => `Linking ${item}. Use the arrow keys to choose what to link it to, Enter to link, Escape to cancel.`,
    selected: item => `Selected ${item}. Click where it should go, or click it again to cancel.`,
    nextTarget: "Tab moves to the next target.",
    over: (target, position) => (position ? `${target ? `${target}, ` : ""}position ${position.index} of ${position.count}` : target),
    at: (target, x, y) => `${target ? `${target}, ` : ""}${x} from the left, ${y} from the top`,
    dropped: (item, target) => (target ? `Dropped ${item} on ${target}.` : `Dropped ${item}.`),
    copied: (item, target) => (target ? `Added ${item} to ${target}.` : `Added ${item}.`),
    linked: (item, target) => `Linked ${item} to ${target}.`,
    // The words of the shared messages, written out: a catalog of Drag is complete without a second file.
    cancelled: () => "Cancelled.",
    notAllowed: "Cancelled. This is no longer allowed here.",
  },
  catalogs,
)
