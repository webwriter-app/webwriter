/** The names of the controls. */
export type PlaybackMessages = {
    play: string;
    pause: string;
    step: string;
    back: string;
    reset: string;
    /** The name of the scrubber. */
    seek: string;
    /** The name of the speed button. It receives the current speed, and the speed as text in the widget's language. */
    rate: (rate: number, shown: string) => string;
};
/** The messages of Playback with their catalogs. */
export declare const playbackMessages: import("../../messages.js").MessageSource<PlaybackMessages>;
