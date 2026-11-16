import { ModuleCore, type CoreOptions } from "./base.js";
import { type MessagesOption } from "./messages.js";
import { type PlaybackMessages } from "./messages/playback/index.js";
export { playbackMessages, type PlaybackMessages } from "./messages/playback/index.js";
/** What a marked control or `run()` can ask for. */
export type PlaybackCommand = "toggle" | "play" | "pause" | "step" | "back" | "reset" | "rate" | "seek";
/** Options of `PlaybackCore`. Give `step`, or `steps`, or `play` and `pause`, or `media`. */
export type PlaybackOptions = CoreOptions & {
    /** A continuous run: advance the simulation by `dt` seconds of simulated time. */
    step?: (dt: number) => void;
    /** A discrete run: how many steps there are. Enables `back` and `seek`. */
    steps?: () => number;
    /** A discrete run: display the step with this index. A template can read `currentStep` instead. */
    show?: (index: number) => void;
    /** Seconds per step: the length of a discrete step (default 1), the fixed timestep of a continuous run, or what `step` and `back` move a media element by (default 1). */
    interval?: number | (() => number);
    /** The speeds the `rate` button cycles through. Default `[0.5, 1, 2, 4]`. */
    rates?: readonly number[];
    /** Return the widget to its initial state. Default: go to step 0. */
    reset?: () => void;
    /** For a run that lives elsewhere, such as a worker: called when it should start. If it throws, the run stays paused. */
    play?: () => void;
    /** For a run that lives elsewhere: called when it should stop. */
    pause?: () => void;
    /** A `<video>` or `<audio>` element of the template to control instead. Asked after every render. */
    media?: () => HTMLMediaElement | null | undefined;
    /** Called once per animation frame after the run advanced, and after a step or a reset: paint the canvas here. */
    draw?: () => void;
    /**
     * Start when the widget is first shown, unless it is being edited. With
     * `true` the run also stays paused for a reader who prefers reduced
     * motion; `"always"` starts for them too, for a run that is the content.
     */
    autoplay?: boolean | "always";
    /** Asked before a command from a marked control or `run()`. Return false to refuse. */
    can?: (command: PlaybackCommand) => boolean;
    /** Other names for the controls. */
    messages?: MessagesOption<PlaybackMessages>;
};
/** The state of `PlaybackCore`, as of its last change. */
export type PlaybackSnapshot = {
    readonly paused: boolean;
    readonly ended: boolean;
    readonly playbackRate: number;
    /** The index of a discrete run. */
    readonly step: number;
    readonly steps: number;
    /** The time at the last state change. Read `currentTime` on the core for the running value. */
    readonly currentTime: number;
    readonly duration: number;
};
/**
 * Seconds as a clock in a language: `m:ss`, or `h:mm:ss` with `hours`. The
 * digits and the separator are those of the language (`Intl`). Pass `hours`
 * for every time that is shown next to one of an hour or more.
 */
export declare function formatTime(seconds: number, hours?: boolean, language?: string): string;
/**
 * The run state and the loop of a widget that plays over time, with the
 * interface of a media element. Configure it with `step` (continuous), with
 * `steps` and `show` (discrete), with `play` and `pause` (a run elsewhere), or
 * give it a `<video>` or `<audio>` element.
 *
 * In the shadow template, `data-ww-playback="toggle|play|pause|step|back|reset|rate"`
 * marks a button, `"seek"` a range input and `"time"` an `<output>`.
 * `ww-playbackchange` on the host reports state changes.
 */
export declare class PlaybackCore extends ModuleCore<PlaybackSnapshot> {
    #private;
    /** Takes the options, or a media element in their place. */
    constructor(host: HTMLElement, options?: PlaybackOptions | HTMLMediaElement);
    /** As on a media element. */
    get paused(): boolean;
    /** A discrete run ends on its last step. A continuous run never ends. */
    get ended(): boolean;
    /** The speed: simulated seconds per second. */
    get playbackRate(): number;
    set playbackRate(rate: number);
    /** Seconds: the position of the media, the step index times the interval, or the simulated time since the last reset. */
    get currentTime(): number;
    /** Seeks a discrete run or the media. A continuous run cannot be sought. */
    set currentTime(seconds: number);
    /** Seconds. Infinite for a continuous run, as for a live stream. */
    get duration(): number;
    /**
     * Starts the run. As on a media element, the promise rejects if the run
     * could not start: the browser refused to play the media, or the `play`
     * callback threw. The state then stays paused.
     */
    play(): Promise<void>;
    /** Stops the run where it is. */
    pause(): void;
    /** The index of the current step of a discrete run. */
    get currentStep(): number;
    /** The number of steps of a discrete run, otherwise 0. */
    get steps(): number;
    /** Seconds per step. A discrete run and a media element without one take a second; a continuous run without one steps every frame (0). */
    get interval(): number;
    /** The speeds a reader can choose. */
    get rates(): readonly number[];
    /** Whether the run can go backwards and be sought: a discrete run, or media of a known length. */
    get seekable(): boolean;
    /** Whether the run can advance by single steps: not a run that lives elsewhere. */
    get steppable(): boolean;
    /** Plays if paused, pauses if playing. At the end of a discrete run it starts over. */
    toggle(): void;
    /** One step forward, paused. A continuous run advances by one timestep (1/60 s without an interval), media by the interval. */
    step(): void;
    /** One step back, paused. Does nothing in a continuous run. */
    back(): void;
    /** Jumps to a step index of a discrete run, or to a time in seconds of the media. */
    seek(position: number): void;
    /** Pauses and returns to the start: the `reset` callback, then step 0 and time 0. */
    reset(): void;
    /** The next speed in `rates`, starting over after the last. */
    nextRate(): void;
    /** A command as a marked control gives it: refused while `can(command)` is false. Returns whether it ran. */
    run(command: PlaybackCommand, position?: number): boolean;
    /**
     * Advances the run by `dt` seconds of real time, as the loop does on every
     * frame. With an interval, whole steps of exactly that length are taken
     * and the rest is kept for the next frame.
     */
    advance(dt: number): void;
    getSnapshot(): PlaybackSnapshot;
    protected onConnect(): void;
    protected onRefresh(): void;
}
