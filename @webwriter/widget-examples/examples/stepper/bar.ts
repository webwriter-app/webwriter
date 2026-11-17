// The transport bar and the styles shared by <ww-stepper> and <ww-media-stepper>.
import { css, html } from "lit";

/**
 * The transport buttons both steppers render. `data-ww-shortcut` names the action whose
 * keys a button announces. It does nothing in a widget without Shortcuts.
 */
export const bar = html`
    <div class="bar">
        <button data-ww-playback="back" data-ww-shortcut="previous"></button>
        <button data-ww-playback="toggle" data-ww-shortcut="toggle"></button>
        <button data-ww-playback="step" data-ww-shortcut="next"></button>
        <input type="range" data-ww-playback="seek" />
        <output data-ww-playback="time"></output>
        <button data-ww-playback="rate"></button>
        <button data-ww-playback="reset"></button>
    </div>
`;

/** The styles both steppers share. */
export const styles = css`
    :host { display: block; }
    .stage { min-height: 3rem; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 4px; }
    .stage:focus-visible { outline: 2px solid Highlight; }
    .bar { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem; }
    .bar input { flex: 1; min-width: 4rem; }
    button { min-width: 2rem; min-height: 2rem; }
    .keys { margin: 0.5rem 0 0; font-size: 0.8em; color: #6b7280; }
`;
