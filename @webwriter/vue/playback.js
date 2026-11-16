import {computed, proxyRefs} from "vue"
import {PlaybackCore} from "@webwriter/widget/playback"
import {useCore} from "./base.js"

export function usePlayback({host, ...options} = {}) {
  const {core, snapshot} = useCore(({host, root}) => new PlaybackCore(host, {...options, root}), host)
  const field = name => computed(() => snapshot.value[name])
  // Time that passes while playing is not in the snapshot: it does not render. Read `currentTime` when needed.
  return proxyRefs({
    core,
    paused: field("paused"),
    ended: field("ended"),
    steps: field("steps"),
    currentStep: field("step"),
    duration: field("duration"),
    get playbackRate() {
      void snapshot.value
      return core.playbackRate
    },
    set playbackRate(rate) {
      core.playbackRate = rate
    },
    get currentTime() {
      return core.currentTime
    },
    set currentTime(seconds) {
      core.currentTime = seconds
    },
    play: () => core.play(),
    pause: () => core.pause(),
    toggle: () => core.toggle(),
    step: () => core.step(),
    back: () => core.back(),
    seek: position => core.seek(position),
    reset: () => core.reset(),
    run: (command, position) => core.run(command, position),
  })
}
