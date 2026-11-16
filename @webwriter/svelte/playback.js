import {PlaybackCore} from "@webwriter/widget/playback"
import {bindCore} from "./bind.js"

/**
 * Playback for the widget: `const playback = playbackStore($host(), {steps: () => items.length})`.
 * Mark the buttons in the template with `data-ww-playback`. `$playback`
 * holds `paused`, `ended`, `step`, `steps`, `playbackRate`, `currentTime` and
 * `duration` as of the last state change; time that passes while playing does
 * not change it, the core updates a time output and a scrubber itself. The
 * store has `play`, `pause`, `toggle`, `step`, `back`, `seek`, `reset` and
 * `run` of the core. It also reads the core live, as a media element does:
 * `paused`, `ended`, `playbackRate`, `currentTime`, `duration`, `currentStep`
 * and `steps`; `playbackRate` and `currentTime` can be set.
 * A media element is passed as `{media: () => element}`.
 */
export function playbackStore(host, options = {}) {
  const store = bindCore(host, options, options => new PlaybackCore(host, options), {
    methods: ["play", "pause", "toggle", "step", "back", "seek", "reset", "run"],
  })
  for(const name of ["paused", "ended", "duration", "currentStep", "steps"]) {
    Object.defineProperty(store, name, {get: () => store.core[name]})
  }
  for(const name of ["playbackRate", "currentTime"]) {
    Object.defineProperty(store, name, {get: () => store.core[name], set: value => void (store.core[name] = value)})
  }
  return store
}
