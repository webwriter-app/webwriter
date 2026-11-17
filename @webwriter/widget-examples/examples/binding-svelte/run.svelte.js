import 'svelte/internal/disclose-version';
import { withWidgetRuntime } from "@webwriter/svelte";
import * as $ from 'svelte/internal/client';
import { jsonDataStore } from "@webwriter/svelte/data";
import { localizeStore } from "@webwriter/svelte/localize";
import { playbackStore } from "@webwriter/svelte/playback";

var root = $.from_html(`<p class="step"> </p> <button data-ww-playback="toggle">Play</button> <button data-ww-playback="step">Step</button> <button data-ww-playback="back">Back</button> <button data-ww-playback="reset">Reset</button> <button class="count"> </button> <p class="locale"> </p>`, 1);

export default function Run($$anchor, $$props) {
	$.push($$props, true);

	const $playback = () => $.store_get(playback, '$playback', $$stores);
	const $data = () => $.store_get(data, '$data', $$stores);
	const $l10n = () => $.store_get(l10n, '$l10n', $$stores);
	const [$$stores, $$cleanup] = $.setup_stores();
	const host = $$props.$$host;
	const names = ["one", "two", "three", "four"];
	let shown = $.state(0);

	const playback = playbackStore(host, {
		steps: () => names.length,
		show: (index) => $.set(shown, index, true),
		interval: 1
	});

	const data = jsonDataStore(host, { defaults: { count: 0 }, block: "document" });

	const l10n = localizeStore(host, {
		sourceLocale: "en",
		targetLocales: ["de"],
		load: async () => ({ templates: { greeting: "Hallo" } })
	});

	host.playback = playback;
	host.data = data;
	host.l10n = l10n;

	var fragment = root();
	var p = $.first_child(fragment);
	var text = $.only_child(p);
	var button = $.sibling(p, 10);
	var text_1 = $.only_child(button);
	var p_1 = $.sibling(button, 2);
	var text_2 = $.only_child(p_1, true);

	$.template_effect(() => {
		$.set_text(text, `${names[$.get(shown)] ?? ''} ${$playback().paused ? "paused" : "playing"} ${$playback().step ?? ''}/${$playback().steps ?? ''}`);
		$.set_text(text_1, `Count ${$data().value.count ?? ''}`);
		$.set_text(text_2, $l10n().locale);
	});

	$.delegated('click', button, () => data.set({ count: $data().value.count + 1 }));
	$.append($$anchor, fragment);
	$.pop();
	$$cleanup();
}

$.delegate(['click']);
customElements.define('ww-b-run', $.create_custom_element(Run, {}, [], [], { mode: 'open' }, (Base) => withWidgetRuntime(Base)));