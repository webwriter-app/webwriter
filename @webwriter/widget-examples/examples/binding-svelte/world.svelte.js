import 'svelte/internal/disclose-version';
import { withDeclarations, withWidgetRuntime } from "@webwriter/svelte";
import * as $ from 'svelte/internal/client';
import { dragStore } from "@webwriter/svelte/drag";
import { shortcutsStore } from "@webwriter/svelte/shortcuts";
import { viewportStore } from "@webwriter/svelte/viewport";

var root = $.from_html(`<div class="placed svelte-4qkeq8"></div>`);
var root_1 = $.from_html(`<div class="side svelte-4qkeq8"><div class="chip svelte-4qkeq8" data-ww-drag="chip" data-ww-drag-effect="copy" data-ww-key="and" data-ww-label="AND" tabindex="0">AND</div> <button data-ww-shortcut="fit">Fit</button></div> <div class="board svelte-4qkeq8" data-ww-viewport="canvas" data-ww-viewport-zoom="0.25 4" data-ww-drop="chip" data-ww-drop-position="point" data-ww-drop-space="world" aria-label="Board" tabindex="0"><div class="world svelte-4qkeq8"></div></div>`, 1);

const $$css = {
	hash: 'svelte-4qkeq8',
	code: ':host {display:flex;width:640px;height:260px;}.side.svelte-4qkeq8 {width:120px;padding:6px;box-sizing:border-box;border:1px solid #c8c8c8;}.chip.svelte-4qkeq8 {width:60px;padding:4px;margin-bottom:4px;border:1px solid #555;background:#fff;cursor:grab;touch-action:none;}.board.svelte-4qkeq8 {position:relative;flex:1;min-width:0;overflow:hidden;border:1px solid #c8c8c8;background:#f4f4f5;}.world.svelte-4qkeq8 {position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;}.placed.svelte-4qkeq8 {position:absolute;width:60px;height:30px;box-sizing:border-box;border:1px solid #555;background:#bfdbfe;}'
};

export default function World($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css);

	const $viewport = () => $.store_get(viewport, '$viewport', $$stores);
	const [$$stores, $$cleanup] = $.setup_stores();
	const host = $$props.$$host;
	const BOARD = { x: 0, y: 0, width: 1200, height: 800 };
	let chips = $.state($.proxy([]));

	// The options of Viewport that the checks vary come from attributes of the host: the wheel, what a resize keeps still,
	// the first view and the follow of a fit (a function is asked when the window first has a size, and at every fit).
	const viewport = viewportStore(host, {
		bounds: () => BOARD,
		margin: 2000,
		wheel: host.getAttribute("wheel") ?? undefined,
		resize: host.getAttribute("resize") ?? undefined,
		start: () => host.hasAttribute("start-x")
			? {
				centre: {
					x: Number(host.getAttribute("start-x")),
					y: Number(host.getAttribute("start-y"))
				},
				scale: 1
			}
			: undefined,
		fit: () => ({ follow: host.getAttribute("follow") ?? undefined })
	});

	// The viewport converts the pointer's place into the world's.
	const drag = dragStore(host, { viewport: viewport.core });

	const shortcuts = shortcutsStore(host);

	host.viewport = viewport;
	host.drag = drag;
	host.shortcuts = shortcuts;
	host.chips = () => $.snapshot($.get(chips));
	host.lastDrop = null;

	host.removeLast = () => {
		if (!$.get(chips).length) return false;

		$.get(chips).pop();

		return true;
	};

	function drop(event) {
		const { x, y, key } = event.detail;

		host.lastDrop = { x, y, key };

		if (x === null || y === null) return;

		$.get(chips).push({ id: `c${$.get(chips).length}`, x, y });
	}

	var fragment = root_1();
	var div = $.first_child(fragment);
	var button = $.sibling($.child(div), 2);

	$.reset(div);

	var div_1 = $.sibling(div, 2);
	var div_2 = $.child(div_1);
	let styles;

	$.each(div_2, 21, () => $.get(chips), (chip) => chip.id, ($$anchor, chip) => {
		var div_3 = root();
		let styles_1;

		$.template_effect(() => styles_1 = $.set_style(div_3, '', styles_1, {
			left: `${$.get(chip).x ?? ''}px`,
			top: `${$.get(chip).y ?? ''}px`
		}));

		$.append($$anchor, div_3);
	});

	$.reset(div_2);
	$.reset(div_1);

	$.template_effect(() => styles = $.set_style(div_2, '', styles, {
		transform: `translate(${$viewport().x ?? ''}px, ${$viewport().y ?? ''}px) scale(${$viewport().scale ?? ''})`
	}));

	$.delegated('click', button, () => host.fit());
	$.event('ww-dragcommit', div_1, drop);
	$.append($$anchor, fragment);
	$.pop();
	$$cleanup();
}

$.delegate(['click']);

customElements.define('ww-b-world', $.create_custom_element(World, {}, [], [], { mode: 'open' }, (Base) => class World extends withDeclarations(withWidgetRuntime(Base)) {
	static actions = {
		fit: { label: { _: "Fit" }, shortcut: "F" },
		remove: { label: { _: "Remove the last chip" }, shortcut: "Delete" }
	};

	// The Delete key has nothing to do without a chip: the action declines it.
	remove() {
		return this.removeLast();
	}

	fit() {
		void this.viewport.fit();
	}
}));