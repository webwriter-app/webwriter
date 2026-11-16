import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "დაკვრა",
  pause: "პაუზა",
  step: "ერთი ნაბიჯი წინ",
  back: "ერთი ნაბიჯი უკან",
  reset: "საწყისზე დაბრუნება",
  seek: "პოზიცია",
  rate: (_rate, shown) => `სიჩქარე: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
