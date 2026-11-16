import {useMemo} from "react"
import {PlaybackCore} from "@webwriter/widget/playback"
import {useCore} from "./base.js"

/**
 * React binding of Playback. Mark buttons with `data-ww-playback="play"` and
 * so on. The component renders when the run state changes; time that passes
 * while playing does not render, the module updates the time output and the
 * scrubber itself. `currentTime` is read when the component renders.
 */
export function usePlayback(host, options) {
  const {core, snapshot} = useCore(host, (o) => new PlaybackCore(host, o), options)
  const methods = useMemo(() => ({
    play: () => core.play(),
    pause: () => core.pause(),
    toggle: () => core.toggle(),
    step: () => core.step(),
    back: () => core.back(),
    seek: (position) => core.seek(position),
    reset: () => core.reset(),
    run: (command, position) => core.run(command, position),
    setPlaybackRate: (rate) => {
      core.playbackRate = rate
    },
    setCurrentTime: (seconds) => {
      core.currentTime = seconds
    },
  }), [core])
  return {
    paused: snapshot.paused,
    ended: snapshot.ended,
    playbackRate: snapshot.playbackRate,
    currentTime: core.currentTime,
    duration: snapshot.duration,
    currentStep: snapshot.step,
    steps: snapshot.steps,
    ...methods,
  }
}
