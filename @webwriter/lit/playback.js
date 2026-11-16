import { PlaybackCore } from "@webwriter/widget/playback";
import { CoreController } from "./base.js";
class Playback extends CoreController {
  constructor(host, options = {}) {
    super(host, (root) => new PlaybackCore(host, { ...options, root }));
  }
  /** As on a media element. */
  get paused() {
    return this.core.paused;
  }
  /** True on the last step of a discrete run and at the end of the media. Never for a continuous run. */
  get ended() {
    return this.core.ended;
  }
  /** The speed: simulated seconds per second. */
  get playbackRate() {
    return this.core.playbackRate;
  }
  set playbackRate(rate) {
    this.core.playbackRate = rate;
  }
  /** Seconds: the position of the media, the step index times the interval, or the simulated time since the last reset. */
  get currentTime() {
    return this.core.currentTime;
  }
  set currentTime(seconds) {
    this.core.currentTime = seconds;
  }
  /** Seconds. Infinite for a continuous run. */
  get duration() {
    return this.core.duration;
  }
  /** The index of the current step of a discrete run. */
  get currentStep() {
    return this.core.currentStep;
  }
  /** The number of steps of a discrete run, otherwise 0. */
  get steps() {
    return this.core.steps;
  }
  /** Starts the run. The promise rejects if it could not start; the state then stays paused. */
  play() {
    return this.core.play();
  }
  /** Stops the run where it is. */
  pause() {
    this.core.pause();
  }
  /** Plays if paused, pauses if playing. */
  toggle() {
    this.core.toggle();
  }
  /** One step forward, paused. */
  step() {
    this.core.step();
  }
  /** One step back, paused. */
  back() {
    this.core.back();
  }
  /** Jumps to a step index of a discrete run, or to a time in seconds of the media. */
  seek(position) {
    this.core.seek(position);
  }
  /** Pauses and returns to the start. */
  reset() {
    this.core.reset();
  }
  /** A command as a marked button gives it: refused while `can(command)` is false. */
  run(command, position) {
    return this.core.run(command, position);
  }
}
export {
  Playback
};
