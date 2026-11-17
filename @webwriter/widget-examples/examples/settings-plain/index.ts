// A countdown card as a plain custom element: no Lit and no other framework,
// only the cores. Every type a setting can hold appears once.
import { PermissionsCore } from "@webwriter/widget/permissions";
import { formatDuration, SettingsCore, type EditorOption, type SettingsDeclarations, type SettingValues } from "@webwriter/widget/settings";

export const settings = {
    heading: { type: String, default: "Break", maxlength: 24, label: { _: "Heading", de: "Überschrift" }, placeholder: { _: "What the time is for" } },
    note: { type: String, multiline: true, label: { _: "Note", de: "Notiz" } },
    length: { type: Number, control: "duration", default: 300, min: 5, max: 7200, group: "time", label: { _: "Length", de: "Dauer" } },
    start: { type: "time", group: "time", label: { _: "Starts at", de: "Beginnt um" } },
    day: { type: "date", group: "time", label: { _: "Day", de: "Tag" } },
    until: { type: "datetime-local", group: "time", label: { _: "Open until" } },
    days: {
        type: "select",
        multiple: true,
        group: "time",
        label: { _: "Days", de: "Tage" },
        options: [
            { value: "mon", label: { _: "Monday", de: "Montag" } },
            { value: "wed", label: { _: "Wednesday", de: "Mittwoch" } },
            { value: "fri", label: { _: "Friday", de: "Freitag" } },
        ],
    },
    size: { type: Number, default: 24, steps: [16, 24, 40, 64], unit: "px", control: "range", group: "look", label: { _: "Size", de: "Größe" } },
    volume: { type: Number, default: 0.5, min: 0, max: 1, step: 0.1, control: "range", label: { _: "Volume", de: "Lautstärke" }, disabled: (card: { sound: boolean }) => !card.sound && { _: "The sound is off", de: "Der Ton ist aus" } },
    rounds: { type: Number, default: 1, min: 1, max: 9, step: 1, label: { _: "Rounds", de: "Runden" } },
    sound: { type: Boolean, default: true, label: { _: "Sound", de: "Ton" } }, // stored as no-sound
    loop: { type: Boolean, control: "switch", label: { _: "Repeat", de: "Wiederholen" } },
    theme: {
        type: "select",
        default: "auto",
        control: "segmented",
        group: "look",
        label: { _: "Theme", de: "Thema" },
        options: [{ value: "auto", label: { _: "Automatic", de: "Automatisch" } }, { value: "light", label: { _: "Light", de: "Hell" } }, { value: "dark", label: { _: "Dark", de: "Dunkel" } }],
    },
    shape: {
        type: "select",
        default: "ring",
        group: "look",
        label: { _: "Shape", de: "Form" },
        options: [
            { value: "ring", label: { _: "Ring" } },
            { label: { _: "Bars", de: "Balken" }, children: [{ value: "bar-thin", label: { _: "Thin", de: "Dünn" } }, { value: "bar-wide", label: { _: "Wide", de: "Breit" } }] },
        ],
    },
    shows: { type: "select", multiple: true, control: "tree", default: ["minutes", "seconds"], options: [{ value: "hours" }, { value: "minutes" }, { value: "seconds" }], label: { _: "Shows" } },
    accent: { type: "color", default: "#2563eb", swatches: ["#2563eb", "#16a34a", "#dc2626"], group: "look", label: { _: "Accent", de: "Akzent" } },
    code: { type: String, pattern: "[A-Z]{3}-\\d{2}", minlength: 6, maxlength: 6, label: { _: "Room code" } },
    contact: { type: "email", label: { _: "Contact" } },
    link: { type: "url", label: { _: "More" } },
    phone: { type: "tel", label: { _: "Phone" } },
    pin: { type: "password", minlength: 4, label: { _: "PIN" } },
    target: { type: "reference", selector: "ww-settings-plain", label: { _: "Starts after" } },
} satisfies SettingsDeclarations;

const template = document.createElement("template");
template.innerHTML = `
<style>
  :host { display: block; font-family: system-ui; }
  .card { padding: 1rem; border: 2px solid var(--accent); border-radius: 8px; }
  .card[data-theme="dark"] { background: #111827; color: #f9fafb; }
  .time { font-variant-numeric: tabular-nums; }
  form { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.5rem; margin-top: 0.75rem; }
  label, fieldset { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85em; }
  fieldset { margin: 0; padding: 0.25rem 0.5rem; }
  fieldset label, label.inline { flex-direction: row; align-items: center; gap: 0.35rem; }
</style>
<div class="card"><strong class="heading"></strong> <span class="time"></span><p class="note"></p></div>
<form>
  <label><span data-ww-setting-label="heading"></span><input type="text" data-ww-setting="heading"></label>
  <label><span data-ww-setting-label="note"></span><textarea rows="2" data-ww-setting="note"></textarea></label>
  <label><span data-ww-setting-label="length"></span><input type="text" data-ww-setting="length"></label>
  <label><span data-ww-setting-label="start"></span><input type="time" data-ww-setting="start"></label>
  <label><span data-ww-setting-label="day"></span><input type="date" data-ww-setting="day"></label>
  <label><span data-ww-setting-label="until"></span><input type="datetime-local" data-ww-setting="until"></label>
  <label><span data-ww-setting-label="days"></span><select multiple size="3" data-ww-setting="days"></select></label>
  <label><span data-ww-setting-label="size"></span><input type="range" data-ww-setting="size"></label>
  <label>Size (list)<select data-ww-setting="size"></select></label>
  <label data-ww-can="allowVolume"><span data-ww-setting-label="volume"></span><input type="range" data-ww-setting="volume"></label>
  <label><span data-ww-setting-label="rounds"></span><input type="number" data-ww-setting="rounds"></label>
  <label class="inline"><input type="checkbox" data-ww-setting="sound"><span data-ww-setting-label="sound"></span></label>
  <label class="inline"><input type="checkbox" role="switch" data-ww-setting="loop"><span data-ww-setting-label="loop"></span></label>
  <fieldset><legend data-ww-setting-label="theme"></legend>
    <label><input type="radio" name="theme" value="auto" data-ww-setting="theme"><span data-ww-setting-label="theme=auto"></span></label>
    <label><input type="radio" name="theme" value="light" data-ww-setting="theme"><span data-ww-setting-label="theme=light"></span></label>
    <label><input type="radio" name="theme" value="dark" data-ww-setting="theme"><span data-ww-setting-label="theme=dark"></span></label>
  </fieldset>
  <label><span data-ww-setting-label="shape"></span><select data-ww-setting="shape"></select></label>
  <fieldset><legend data-ww-setting-label="shows"></legend>
    <label><input type="checkbox" value="hours" data-ww-setting="shows">h</label>
    <label><input type="checkbox" value="minutes" data-ww-setting="shows">min</label>
    <label><input type="checkbox" value="seconds" data-ww-setting="shows"><span data-ww-setting-label="shows=seconds"></span></label>
  </fieldset>
  <label><span data-ww-setting-label="accent"></span><input type="color" data-ww-setting="accent"></label>
  <label><span data-ww-setting-label="code"></span><input type="text" data-ww-setting="code"></label>
  <label><span data-ww-setting-label="contact"></span><input type="email" data-ww-setting="contact"></label>
  <label><span data-ww-setting-label="link"></span><input type="url" data-ww-setting="link"></label>
  <label><span data-ww-setting-label="phone"></span><input type="tel" data-ww-setting="phone"></label>
  <label><span data-ww-setting-label="pin"></span><input type="password" data-ww-setting="pin"></label>
  <label><span data-ww-setting-label="target"></span><input type="text" data-ww-setting="target"></label>
</form>`;

// The declarations give the properties their types; the core defines them at run time.
export interface SettingsPlain extends SettingValues<typeof settings> {}

export class SettingsPlain extends HTMLElement {
    static settings = settings;
    static optionGroups = { time: { label: { _: "Time", de: "Zeit" } }, look: { label: { _: "Look", de: "Aussehen" } } };
    static options = { caption: { type: String, label: { _: "Caption" } } };
    static permissions = { allowVolume: { label: { _: "Learners may change the volume in this widget" }, attribute: "allow-volume" } };

    #permissions = new PermissionsCore(this);
    #settings = new SettingsCore(this, { entryTimeout: 400 });
    #unsubscribe: (() => void) | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
        this.#settings.defineProperties(this);
    }

    /** The core, for the checks. */
    get settingsCore(): SettingsCore {
        return this.#settings;
    }

    /** The editor's option declarations: the class's own and one per setting. */
    get options(): Record<string, EditorOption> {
        return { ...SettingsPlain.options, ...this.#settings.editorOptions() };
    }

    connectedCallback() {
        this.#permissions.connect();
        this.#settings.connect();
        this.#unsubscribe = this.#settings.subscribe(() => this.#render());
        this.#render();
    }

    disconnectedCallback() {
        this.#unsubscribe?.();
        this.#settings.disconnect();
        this.#permissions.disconnect();
    }

    /** The card shows the settings. The bound controls are kept up to date by the core. */
    #render() {
        const root = this.shadowRoot!;
        const card = root.querySelector<HTMLElement>(".card")!;
        card.dataset.theme = this.theme;
        card.style.setProperty("--accent", this.accent);
        card.style.fontSize = `${this.size}px`;
        root.querySelector(".heading")!.textContent = this.heading;
        root.querySelector(".time")!.textContent = formatDuration(this.length);
        root.querySelector(".note")!.textContent = this.note ?? "";
    }
}
customElements.define("ww-settings-plain", SettingsPlain);
