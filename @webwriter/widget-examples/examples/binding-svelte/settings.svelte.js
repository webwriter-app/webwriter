import 'svelte/internal/disclose-version';
import { withDeclarations, withWidgetRuntime } from "@webwriter/svelte";
import { withSettings } from "@webwriter/svelte/settings";
import * as $ from 'svelte/internal/client';
import { helpStore } from "@webwriter/svelte/help";
import { permissionsStore } from "@webwriter/svelte/permissions";
import { printNoteStore } from "@webwriter/svelte/print";
import { settingsStore } from "@webwriter/svelte/settings";

const settings = {
	speed: {
		type: Number,
		default: 1,
		min: 0,
		max: 10,
		step: 1,
		control: "range",
		label: (widget) => ({ _: `Speed of ${widget.subject}` }),
		description: (widget) => ({ _: `How fast ${widget.subject} runs` })
	},
	mode: {
		type: "select",
		default: "calm",
		label: { _: "Mode" },
		options: [
			{
				value: "calm",
				label: (widget) => ({ _: `${widget.subject} calm` })
			},
			{ value: "busy", label: { _: "Busy" } }
		]
	},
	loud: { type: Boolean, default: true, label: { _: "Loud" } }
};

var root = $.from_html(`<form class="svelte-1dw4jtp"><label><span data-ww-setting-label="speed"></span><input type="range" data-ww-setting="speed"/></label> <label><span data-ww-setting-label="mode"></span><select data-ww-setting="mode"></select></label> <label><span data-ww-setting-label="loud"></span><input type="checkbox" data-ww-setting="loud"/></label></form> <p class="speed"> </p> <button data-ww-help="Resets the card" data-ww-can="allowReset" class="reset">Reset</button> <button data-ww-help-toggle="" class="help">?</button> <p class="mode"> </p> <p class="print-text"> </p> <p class="help-state"> </p>`, 1);

const $$css = {
	hash: 'svelte-1dw4jtp',
	code: ':host {display:block;font:12px system-ui, sans-serif;}form.svelte-1dw4jtp {display:grid;gap:4px;}'
};

export default function Settings($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css);

	const $settingsState = () => $.store_get(settingsState, '$settingsState', $$stores);
	const $permissions = () => $.store_get(permissions, '$permissions', $$stores);
	const $printNote = () => $.store_get(printNote, '$printNote', $$stores);
	const $help = () => $.store_get(help, '$help', $$stores);
	const [$$stores, $$cleanup] = $.setup_stores();
	const host = $$props.$$host;
	const settingsState = settingsStore(host);
	const permissions = permissionsStore(host);
	const help = helpStore(host);

	host.settingsStore = settingsState;
	host.permissionsStore = permissions;
	host.helpStore = help;

	const printNote = printNoteStore(host, { address: "https://example.org/lesson" });

	host.printNoteStore = printNote;

	var fragment = root();
	var p = $.sibling($.first_child(fragment), 2);
	var text = $.only_child(p, true);
	var p_1 = $.sibling(p, 6);
	var text_1 = $.only_child(p_1);
	var p_2 = $.sibling(p_1, 2);
	var text_2 = $.only_child(p_2, true);
	var p_3 = $.sibling(p_2, 2);
	var text_3 = $.only_child(p_3, true);

	$.template_effect(
		($0) => {
			$.set_text(text, $settingsState().values.speed);
			$.set_text(text_1, `${$permissions().editing ? "editing" : "reading"}${$0 ?? ''}`);
			$.set_text(text_2, $printNote().text);
			$.set_text(text_3, $help().open ? "help open" : "help closed");
		},
		[() => $permissions().can("allowReset") ? " can reset" : ""]
	);

	$.append($$anchor, fragment);
	$.pop();
	$$cleanup();
}

customElements.define('ww-b-settings', $.create_custom_element(Settings, {}, [], [], { mode: 'open' }, (Base) => class Card extends withSettings(withDeclarations(withWidgetRuntime(Base)), settings) {
	// A text of a declaration may be a function of the widget: here of its `subject`.
	subject = "the card";

	static options = {
		note: {
			type: String,
			label: (widget) => ({ _: `Note on ${widget.subject}` })
		}
	};

	static permissions = {
		allowReset: { label: (widget) => ({ _: `Reset ${widget.subject}` }) }
	};
}));