import { ModuleCore } from "./base.js";
import { Messages } from "./messages.js";
import { playbackMessages } from "./messages/playback/index.js";
import { isEditing } from "./permissions.js";
import { adoptStyles } from "./styles.js";
import { whileVisible } from "./visible.js";
import { playbackMessages as playbackMessages2 } from "./messages/playback/index.js";
const icons = {
  play: "M4 2l10 6-10 6z",
  pause: "M3 2h4v12H3zM9 2h4v12H9z",
  step: "M3 2l8 6-8 6zM12 2h2v12h-2z",
  back: "M13 2L5 8l8 6zM2 2h2v12H2z",
  reset: "M8 3V0L3.5 3.5 8 7V4.5A3.5 3.5 0 1 1 4.5 8H3a5 5 0 1 0 5-5z"
};
const styles = `
[data-ww-icon] { width: 1em; height: 1em; fill: currentColor; vertical-align: -0.125em; pointer-events: none; }
[data-ww-playback][aria-disabled="true"] { opacity: 0.5; cursor: default; }
`;
const buttons = ["toggle", "play", "pause", "step", "back", "reset", "rate"];
const EPSILON = 1e-9;
const numerals = /* @__PURE__ */ new Map();
function numeralsOf(language) {
  let known = numerals.get(language);
  if (!known) {
    let locale = language || "en";
    try {
      Intl.getCanonicalLocales(locale);
    } catch {
      locale = "en";
    }
    const Duration = Intl.DurationFormat;
    const parts = Duration ? new Duration(locale, { style: "digital" }).formatToParts({ hours: 1, minutes: 1, seconds: 1 }) : [];
    known = {
      separator: parts.find((part) => part.type === "literal")?.value ?? ":",
      plain: new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2 }),
      padded: new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: 2, maximumFractionDigits: 0 })
    };
    numerals.set(language, known);
  }
  return known;
}
function formatTime(seconds, hours = seconds >= 3600, language = "en") {
  const { separator, plain, padded } = numeralsOf(language);
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds + EPSILON)) : 0;
  const minutes = Math.floor(total / 60);
  const tail = `${separator}${padded.format(total % 60)}`;
  return hours ? `${plain.format(Math.floor(minutes / 60))}${separator}${padded.format(minutes % 60)}${tail}` : `${plain.format(minutes)}${tail}`;
}
class PlaybackCore extends ModuleCore {
  #options;
  #messages;
  #media = null;
  #mediaScope = null;
  #loop = null;
  #paused = true;
  #rate = 1;
  #index = 0;
  /** Simulated time that has passed but was not yet turned into a step. */
  #pending = 0;
  /** Simulated time of a continuous run. */
  #time = 0;
  /** Whether autoplay was decided. It is decided once, when the widget is first shown. */
  #autoplayed = false;
  /** Waits for the widget to be shown before a media element or a run elsewhere starts by itself. */
  #shown = null;
  #snapshot = { paused: true, ended: false, playbackRate: 1, step: 0, steps: 0, currentTime: 0, duration: 0 };
  /** Takes the options, or a media element in their place. */
  constructor(host, options = {}) {
    const given = options instanceof HTMLMediaElement ? { media: () => options } : options;
    super(host, given);
    this.#options = given;
    this.#messages = new Messages(host, playbackMessages, given.messages);
  }
  // ── The media interface ───────────────────────────────────────────────
  /** As on a media element. */
  get paused() {
    return this.#media ? this.#media.paused : this.#paused;
  }
  /** A discrete run ends on its last step. A continuous run never ends. */
  get ended() {
    if (this.#media) return this.#media.ended;
    return this.#discrete && this.steps > 0 && this.#index >= this.steps - 1;
  }
  /** The speed: simulated seconds per second. */
  get playbackRate() {
    return this.#media ? this.#media.playbackRate : this.#rate;
  }
  set playbackRate(rate) {
    if (!(rate > 0)) return;
    if (this.#media) this.#media.playbackRate = rate;
    else this.#rate = rate;
    this.#changed();
  }
  /** Seconds: the position of the media, the step index times the interval, or the simulated time since the last reset. */
  get currentTime() {
    if (this.#media) return this.#media.currentTime;
    return this.#discrete ? this.#index * this.interval : this.#time;
  }
  /** Seeks a discrete run or the media. A continuous run cannot be sought. */
  set currentTime(seconds) {
    if (this.#media) this.#media.currentTime = seconds;
    else if (this.#discrete) this.#goTo(Math.round(seconds / this.interval));
    this.#changed(true);
  }
  /** Seconds. Infinite for a continuous run, as for a live stream. */
  get duration() {
    if (this.#media) return this.#media.duration;
    return this.#discrete ? Math.max(0, this.steps - 1) * this.interval : Infinity;
  }
  /**
   * Starts the run. As on a media element, the promise rejects if the run
   * could not start: the browser refused to play the media, or the `play`
   * callback threw. The state then stays paused.
   */
  play() {
    this.#settleAutoplay();
    if (this.#media) return this.#media.play();
    if (!this.#paused) return Promise.resolve();
    try {
      this.#options.play?.();
    } catch (error) {
      return Promise.reject(error);
    }
    if (this.ended) this.#goTo(0);
    this.#paused = false;
    this.#pending = 0;
    this.#startLoop();
    this.#changed();
    return Promise.resolve();
  }
  /** Stops the run where it is. */
  pause() {
    this.#settleAutoplay();
    if (this.#halt()) this.#changed();
  }
  // ── Beyond a media element ────────────────────────────────────────────
  /** The index of the current step of a discrete run. */
  get currentStep() {
    return this.#index;
  }
  /** The number of steps of a discrete run, otherwise 0. */
  get steps() {
    return Math.max(0, Math.floor(this.#options.steps?.() ?? 0));
  }
  /** Seconds per step. A discrete run and a media element without one take a second; a continuous run without one steps every frame (0). */
  get interval() {
    const { interval } = this.#options;
    const seconds = typeof interval === "function" ? interval() : interval;
    return seconds && seconds > 0 ? seconds : this.#discrete || this.#media ? 1 : 0;
  }
  /** The speeds a reader can choose. */
  get rates() {
    return this.#options.rates ?? [0.5, 1, 2, 4];
  }
  /** Whether the run can go backwards and be sought: a discrete run, or media of a known length. */
  get seekable() {
    return this.#discrete || !!this.#media && Number.isFinite(this.#media.duration);
  }
  /** Whether the run can advance by single steps: not a run that lives elsewhere. */
  get steppable() {
    return !!this.#media || this.#discrete || !!this.#options.step;
  }
  /** Plays if paused, pauses if playing. At the end of a discrete run it starts over. */
  toggle() {
    if (this.paused) this.play().catch(() => {
    });
    else this.pause();
  }
  /** One step forward, paused. A continuous run advances by one timestep (1/60 s without an interval), media by the interval. */
  step() {
    this.#settleAutoplay();
    if (!this.steppable) return;
    this.#halt();
    if (this.#media) this.#media.currentTime = Math.min(this.#media.currentTime + this.interval, this.#media.duration || Infinity);
    else if (this.#discrete) this.#goTo(this.#index + 1);
    else if (this.#options.step) {
      const dt = this.interval || 1 / 60;
      this.#options.step(dt);
      this.#time += dt;
    }
    this.#options.draw?.();
    this.#changed(true);
  }
  /** One step back, paused. Does nothing in a continuous run. */
  back() {
    this.#settleAutoplay();
    if (!this.seekable) return;
    this.#halt();
    if (this.#media) this.#media.currentTime = Math.max(0, this.#media.currentTime - this.interval);
    else this.#goTo(this.#index - 1);
    this.#changed(true);
  }
  /** Jumps to a step index of a discrete run, or to a time in seconds of the media. */
  seek(position) {
    if (!this.seekable || !Number.isFinite(position)) return;
    if (this.#media) this.#media.currentTime = position;
    else this.#goTo(Math.round(position));
    this.#changed(true);
  }
  /** Pauses and returns to the start: the `reset` callback, then step 0 and time 0. */
  reset() {
    this.#settleAutoplay();
    this.#halt();
    this.#options.reset?.();
    this.#pending = this.#time = 0;
    if (this.#media) this.#media.currentTime = 0;
    this.#index = 0;
    if (this.#discrete) this.#options.show?.(0);
    this.#options.draw?.();
    this.#changed(true);
  }
  /** The next speed in `rates`, starting over after the last. */
  nextRate() {
    const { rates } = this;
    if (rates.length) this.playbackRate = rates[(rates.indexOf(this.playbackRate) + 1) % rates.length];
  }
  /** A command as a marked control gives it: refused while `can(command)` is false. Returns whether it ran. */
  run(command, position) {
    if (this.#options.can?.(command) === false) return false;
    if (command === "rate") this.nextRate();
    else if (command === "seek") this.seek(position ?? 0);
    else if (command === "play") this.play().catch(() => {
    });
    else this[command]();
    return true;
  }
  /**
   * Advances the run by `dt` seconds of real time, as the loop does on every
   * frame. With an interval, whole steps of exactly that length are taken
   * and the rest is kept for the next frame.
   */
  advance(dt) {
    const elapsed = dt * this.#rate;
    const every = this.interval;
    if (this.#discrete) {
      const last = this.steps - 1;
      this.#pending += elapsed;
      const due = Math.floor((this.#pending + EPSILON) / every);
      this.#pending -= due * every;
      if (due > 0) this.#goTo(this.#index + due);
      const stopped = this.#index >= last && this.#halt();
      if (due === 0 && !stopped) return;
      this.#changed();
    } else if (this.#options.step) {
      if (every) {
        this.#pending += elapsed;
        const running = !this.#paused;
        for (; this.#pending + EPSILON >= every; this.#pending -= every) {
          this.#options.step(every);
          this.#time += every;
          if (running && this.#paused) {
            this.#pending = 0;
            break;
          }
        }
      } else {
        this.#options.step(elapsed);
        this.#time += elapsed;
      }
    }
    this.#options.draw?.();
    this.#showTime();
  }
  getSnapshot() {
    return this.#snapshot;
  }
  // ── Lifecycle ─────────────────────────────────────────────────────────
  onConnect() {
    const { root } = this;
    this.cleanup(adoptStyles(root, styles));
    this.cleanup(this.#messages.follow(() => this.refresh()));
    this.listen(root, "click", (event) => {
      const control = event.target.closest?.("[data-ww-playback]");
      const command = control?.dataset.wwPlayback;
      if (control && buttons.includes(command) && control.getAttribute("aria-disabled") !== "true") this.run(command);
    });
    this.listen(root, "input", (event) => {
      const control = event.target;
      if (control.dataset?.wwPlayback !== "seek") return;
      if (!this.run("seek", control.valueAsNumber)) this.#showTime();
    });
    this.cleanup(() => {
      this.#stopLoop();
      this.#attach(null);
      this.#shown?.disconnect();
      this.#shown = null;
    });
    this.#snapshot = this.#read();
    if (!this.#paused) this.#startLoop();
    if (this.#options.autoplay && !this.#autoplayed) this.#autoplay();
  }
  onRefresh() {
    this.#attach(this.#options.media?.() ?? null);
    if (this.#discrete && this.#index > Math.max(0, this.steps - 1)) this.#goTo(this.steps - 1);
    this.#changed();
  }
  // ── Internals ─────────────────────────────────────────────────────────
  get #discrete() {
    return !!this.#options.steps;
  }
  /**
   * A run the module drives starts at once: its loop waits by itself until
   * the widget is on screen. A media element and a run that lives elsewhere
   * do not wait, so they are started when the widget is first shown.
   */
  #autoplay() {
    const start = () => {
      this.#autoplayed = true;
      const reduced = this.#options.autoplay !== "always" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || isEditing(this.host)) return;
      this.#attach(this.#options.media?.() ?? null);
      this.play().catch(() => {
      });
    };
    if (this.#discrete || this.#options.step) return start();
    this.#shown = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      this.#shown?.disconnect();
      this.#shown = null;
      start();
    });
    this.#shown.observe(this.host);
  }
  /** A command came first: the run no longer starts by itself. */
  #settleAutoplay() {
    if (!this.#shown) return;
    this.#shown.disconnect();
    this.#shown = null;
    this.#autoplayed = true;
  }
  /** Stops the run without publishing. Returns whether it was running. */
  #halt() {
    if (this.#media) {
      this.#media.pause();
      return false;
    }
    if (this.#paused) return false;
    this.#paused = true;
    this.#stopLoop();
    this.#options.pause?.();
    return true;
  }
  #goTo(index) {
    const next = Math.min(Math.max(0, index), Math.max(0, this.steps - 1));
    if (next === this.#index) return;
    this.#index = next;
    this.#options.show?.(next);
  }
  #startLoop() {
    const looping = this.#discrete || !!this.#options.step;
    if (looping && this.connected) this.#loop ??= whileVisible(this.host, (dt) => this.advance(dt));
  }
  #stopLoop() {
    this.#loop?.stop();
    this.#loop = null;
  }
  #attach(media) {
    if (media === this.#media) return;
    this.#mediaScope?.abort();
    this.#media = media;
    this.#mediaScope = media ? new AbortController() : null;
    if (!media) return;
    const signal = this.#mediaScope.signal;
    for (const type of ["play", "pause", "ended", "ratechange", "durationchange", "emptied"]) {
      media.addEventListener(type, () => this.#changed(), { signal });
    }
    media.addEventListener("seeked", () => this.#changed(true), { signal });
    media.addEventListener("timeupdate", () => this.#showTime(), { signal });
  }
  #read() {
    const { paused, ended, playbackRate, currentTime, duration, steps } = this;
    return { paused, ended, playbackRate, step: this.#index, steps, currentTime, duration };
  }
  /**
   * Publishes the state if it changed and brings the marked controls up to
   * date. Time that only passed while playing is no change of state, unless
   * `moved` says that the position was set.
   */
  #changed(moved = false) {
    const next = this.#read();
    const keys = Object.keys(next).filter((key) => key !== "currentTime" || moved || next.paused);
    const same = keys.every((key) => Object.is(next[key], this.#snapshot[key]));
    if (!same) this.#snapshot = next;
    if (this.connected) this.#showControls();
    if (same) return;
    this.notify();
    this.host.dispatchEvent(new CustomEvent("ww-playbackchange", { detail: next, bubbles: true, composed: true }));
  }
  #timeText() {
    const language = this.#messages.language;
    if (this.#discrete) {
      const { plain } = numeralsOf(language);
      return `${plain.format(this.steps ? this.#index + 1 : 0)} / ${plain.format(this.steps)}`;
    }
    const { currentTime, duration } = this;
    const hours = (Number.isFinite(duration) ? duration : currentTime) >= 3600;
    const now = formatTime(currentTime, hours, language);
    return Number.isFinite(duration) ? `${now} / ${formatTime(duration, hours, language)}` : now;
  }
  /** The parts that change on every frame. */
  #showTime() {
    if (!this.connected) return;
    const text = this.#timeText();
    for (const output of this.root.querySelectorAll('[data-ww-playback="time"]')) {
      if (output.textContent !== text) output.textContent = text;
    }
    const position = String(this.#discrete ? this.#index : this.currentTime);
    for (const range of this.root.querySelectorAll('[data-ww-playback="seek"]')) {
      if (range.value !== position) range.value = position;
      if (range.getAttribute("aria-valuetext") !== text) range.setAttribute("aria-valuetext", text);
    }
  }
  /** Icon, accessible name and availability of every marked control. */
  #showControls() {
    const messages = this.#messages.current;
    const { paused, ended, seekable } = this;
    const atStart = this.#discrete ? this.#index === 0 : this.currentTime === 0;
    const speed = numeralsOf(this.#messages.language).plain.format(this.playbackRate);
    for (const control of this.root.querySelectorAll("[data-ww-playback]")) {
      const command = control.dataset.wwPlayback;
      if (command === "time") continue;
      const allowed = this.#options.can?.(command) !== false;
      if (command === "seek") {
        const range = control;
        const max = this.#discrete ? Math.max(0, this.steps - 1) : seekable ? this.duration : 0;
        for (const [name2, value] of [
          ["min", "0"],
          ["max", String(max)],
          ["step", this.#discrete ? "1" : "any"]
        ]) {
          if (range.getAttribute(name2) !== value) range.setAttribute(name2, value);
        }
        range.disabled = !allowed || !seekable;
        if (!range.labels?.length && !range.hasAttribute("aria-labelledby") && range.getAttribute("aria-label") !== messages.seek) range.setAttribute("aria-label", messages.seek);
        continue;
      }
      const icon = command === "toggle" ? paused ? "play" : "pause" : command;
      const name = command === "rate" ? messages.rate(this.playbackRate, speed) : messages[icon];
      const off = !allowed || command === "play" && !paused || command === "pause" && paused || command === "step" && (ended || !this.steppable) || command === "back" && (!seekable || atStart) || command === "rate" && this.rates.length < 2;
      setIcon(control, icon, command === "rate" ? `${speed}×` : null);
      if (control.getAttribute("aria-label") !== name) control.setAttribute("aria-label", name);
      if (control.title !== name) control.title = name;
      if (off) control.setAttribute("aria-disabled", "true");
      else control.removeAttribute("aria-disabled");
    }
    this.#showTime();
  }
}
function setIcon(control, icon, text) {
  let mark = control.querySelector(":scope > [data-ww-icon]");
  if (!mark && control.childNodes.length) return;
  if (mark?.getAttribute("data-ww-icon") !== icon) {
    const document = control.ownerDocument;
    const next = text === null ? document.createElementNS("http://www.w3.org/2000/svg", "svg") : document.createElement("span");
    next.setAttribute("data-ww-icon", icon);
    next.setAttribute("aria-hidden", "true");
    if (text === null) {
      next.setAttribute("viewBox", "0 0 16 16");
      next.append(document.createElementNS("http://www.w3.org/2000/svg", "path"));
      next.firstElementChild.setAttribute("d", icons[icon]);
    }
    control.replaceChildren(next);
    mark = next;
  }
  if (text !== null && mark.textContent !== text) mark.textContent = text;
}
export {
  PlaybackCore,
  formatTime,
  playbackMessages2 as playbackMessages
};
