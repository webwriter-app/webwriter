// The transport buttons of the stepper in front of a real media element. A
// widget of its own, in a module of its own: a WebWriter package exports one
// module per widget (`./widgets/<tag>.js`), and that module defines its tag.
import { html } from "lit";
import { Playback } from "@webwriter/lit/playback";
import { ExampleElement } from "../shared/base";
import { bar, styles } from "../stepper/bar";

let silence: string | undefined;

/** Silence as a WAV file behind an object URL, so the example needs no network. */
export function silentAudio(seconds = 3, rate = 8000): string {
    const header = new DataView(new ArrayBuffer(44));
    const text = (offset: number, value: string) => [...value].forEach((letter, index) => header.setUint8(offset + index, letter.charCodeAt(0)));
    const size = seconds * rate;
    text(0, "RIFF");
    header.setUint32(4, 36 + size, true);
    text(8, "WAVEfmt ");
    header.setUint32(16, 16, true);
    header.setUint16(20, 1, true); // PCM
    header.setUint16(22, 1, true); // mono
    header.setUint32(24, rate, true);
    header.setUint32(28, rate, true); // bytes per second
    header.setUint16(32, 1, true);
    header.setUint16(34, 8, true); // bits per sample
    text(36, "data");
    header.setUint32(40, size, true);
    return URL.createObjectURL(new Blob([header, new Uint8Array(size).fill(128)], { type: "audio/wav" }));
}

/** The same buttons in front of a real media element. */
export class MediaStepper extends ExampleElement {
    static properties = { src: { type: String, reflect: true } };
    static styles = styles;

    declare src: string | undefined;

    readonly playback = new Playback(this, { media: () => this.renderRoot.querySelector("audio") });

    render() {
        return html`<audio src=${this.src ?? (silence ??= silentAudio())} preload="auto"></audio>${bar}`;
    }
}
customElements.define("ww-media-stepper", MediaStepper);
