<svelte:options
  customElement={{
    tag: "ww-b-settings",
    shadow: "open",
    extend: (Base) =>
      class Card extends withSettings(withDeclarations(withWidgetRuntime(Base)), settings) {
        // A text of a declaration may be a function of the widget: here of its `subject`.
        subject = "the card"
        static options = {
          note: { type: String, label: (widget) => ({ _: `Note on ${widget.subject}` }) },
        }
        static permissions = {
          allowReset: { label: (widget) => ({ _: `Reset ${widget.subject}` }) },
        }
      },
  }}
/>

<script module>
  import { withDeclarations, withWidgetRuntime } from "@webwriter/svelte"
  import { withSettings } from "@webwriter/svelte/settings"

  const settings = {
    speed: { type: Number, default: 1, min: 0, max: 10, step: 1, control: "range", label: (widget) => ({ _: `Speed of ${widget.subject}` }), description: (widget) => ({ _: `How fast ${widget.subject} runs` }) },
    mode: {
      type: "select",
      default: "calm",
      label: { _: "Mode" },
      options: [{ value: "calm", label: (widget) => ({ _: `${widget.subject} calm` }) }, { value: "busy", label: { _: "Busy" } }],
    },
    loud: { type: Boolean, default: true, label: { _: "Loud" } },
  }
</script>

<script>
  import { helpStore } from "@webwriter/svelte/help"
  import { permissionsStore } from "@webwriter/svelte/permissions"
  import { printNoteStore } from "@webwriter/svelte/print"
  import { settingsStore } from "@webwriter/svelte/settings"

  const host = $host()
  const settingsState = settingsStore(host)
  const permissions = permissionsStore(host)
  const help = helpStore(host)
  host.settingsStore = settingsState
  host.permissionsStore = permissions
  host.helpStore = help
  const printNote = printNoteStore(host, { address: "https://example.org/lesson" })
  host.printNoteStore = printNote
</script>

<form>
  <label><span data-ww-setting-label="speed"></span><input type="range" data-ww-setting="speed" /></label>
  <label><span data-ww-setting-label="mode"></span><select data-ww-setting="mode"></select></label>
  <label><span data-ww-setting-label="loud"></span><input type="checkbox" data-ww-setting="loud" /></label>
</form>
<p class="speed">{$settingsState.values.speed}</p>
<button data-ww-help="Resets the card" data-ww-can="allowReset" class="reset">Reset</button>
<button data-ww-help-toggle class="help">?</button>
<p class="mode">{$permissions.editing ? "editing" : "reading"}{$permissions.can("allowReset") ? " can reset" : ""}</p>
<p class="print-text">{$printNote.text}</p>
<p class="help-state">{$help.open ? "help open" : "help closed"}</p>

<style>
  :host { display: block; font: 12px system-ui, sans-serif; }
  form { display: grid; gap: 4px; }
</style>
