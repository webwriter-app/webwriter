import {computed} from "@angular/core"
import {PlaybackCore} from "@webwriter/widget/playback"
import {injectModule} from "./base.js"

/**
 * Binds Playback. Mark the buttons `data-ww-playback`. The signals change with
 * the run state; time that passes while playing does not change them, the
 * module updates the time output and the scrubber itself. Read `currentTime()`
 * for the running value.
 */
export function injectPlayback(options = {}) {
  const snapshot = injectModule(PlaybackCore, options)
  const {core} = snapshot
  const part = name => computed(() => snapshot()[name])
  return {
    core,
    snapshot,
    paused: part("paused"),
    ended: part("ended"),
    playbackRate: part("playbackRate"),
    currentStep: part("step"),
    steps: part("steps"),
    duration: part("duration"),
    currentTime: () => core.currentTime,
    setPlaybackRate: rate => void (core.playbackRate = rate),
    seekTime: seconds => void (core.currentTime = seconds),
    play: () => core.play(),
    pause: () => core.pause(),
    toggle: () => core.toggle(),
    step: () => core.step(),
    back: () => core.back(),
    seek: position => core.seek(position),
    reset: () => core.reset(),
    run: (command, position) => core.run(command, position),
  }
}
