import 'svelte/internal/disclose-version';
import { withWidgetRuntime } from "@webwriter/svelte";
import * as $ from 'svelte/internal/client';
import { listen } from "@webwriter/svelte/base";
import { sceneStore } from "@webwriter/svelte/scene";

var root = $.from_html(`<ww-node> <span class="port right svelte-4q0ytg" data-ww-port="out" data-ww-link="sig"></span> <span class="port left svelte-4q0ytg" data-ww-port="in" data-ww-accept="sig"></span></ww-node>`, 2);
var root_1 = $.from_html(`<ww-path></ww-path>`, 2);
var root_2 = $.from_html(`<ww-scene><!> <!></ww-scene> <p class="marquee"> </p>`, 3);

const $$css = {
	hash: 'svelte-4q0ytg',
	code: ':host {display:block;font:12px system-ui, sans-serif;}ww-scene.svelte-4q0ytg {display:block;width:520px;height:320px;color:rgb(60, 60, 70);}ww-node.svelte-4q0ytg {box-sizing:border-box;background:#fff;border:1px solid #555;padding:4px;}.port.svelte-4q0ytg {position:absolute;width:14px;height:14px;border-radius:50%;background:rgb(0, 120, 255);}.right.svelte-4q0ytg {right:-7px;top:23px;}.left.svelte-4q0ytg {left:-7px;top:23px;}ww-path.svelte-4q0ytg {stroke:rgb(40, 40, 40);stroke-width:2px;}'
};

export default function Scene($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css);

	const $scene = () => $.store_get(scene, '$scene', $$stores);
	const [$$stores, $$cleanup] = $.setup_stores();
	const host = $$props.$$host;

	let places = $.state($.proxy({
		a: { x: 40, y: 40 },
		b: { x: 300, y: 60 },
		c: { x: 300, y: 200 }
	}));

	let wires = $.state($.proxy([{ id: "w1", from: "a:out", to: "b:in" }]));

	// What the checks read: every event of the scene as it was sent, and the names of ports that start no wire.
	host.seen = [];

	host.refused = [];

	// `can` is asked with the port as its third argument for a connection that starts or ends at one.
	const scene = sceneStore(host, {
		can: (action, item, port) => !(action === "connect" && !!port && host.refused.includes(port.dataset.wwPort))
	});

	host.scene = scene;
	host.places = () => $.snapshot($.get(places));

	const record = (event) => host.seen.push(event);

	const handlers = {
		"ww-move": (event) => {
			record(event);

			for (const { key, x, y } of event.detail.items) $.get(places)[key] = { x, y };
		},

		"ww-connect": (event) => {
			record(event);

			const { from, to } = event.detail;

			$.get(wires).push({ id: `w${$.get(wires).length + 1}`, from, to });
		},
		"ww-moving": record,
		"ww-ready": record
	};

	var fragment = root_2();
	var ww_scene = $.first_child(fragment);

	$.set_custom_element_data(ww_scene, 'aria-label', 'Board');
	$.set_class(ww_scene, 1, 'svelte-4q0ytg');

	var node = $.child(ww_scene);

	$.each(node, 17, () => Object.entries($.get(places)), ([key, at]) => key, ($$anchor, $$item) => {
		var $$array = $.derived(() => $.to_array($.get($$item), 2));
		let key = () => $.get($$array)[0];
		let at = () => $.get($$array)[1];
		var ww_node = root();

		$.template_effect(() => $.set_custom_element_data(ww_node, 'data-ww-key', key()));
		$.template_effect(() => $.set_custom_element_data(ww_node, 'x', at().x));
		$.template_effect(() => $.set_custom_element_data(ww_node, 'y', at().y));
		$.set_custom_element_data(ww_node, 'width', '100');
		$.set_custom_element_data(ww_node, 'height', '60');
		$.set_custom_element_data(ww_node, 'selectable', true);
		$.set_custom_element_data(ww_node, 'movable', true);
		$.set_class(ww_node, 1, 'svelte-4q0ytg');

		var text = $.child(ww_node);

		$.next(3);
		$.reset(ww_node);
		$.template_effect(() => $.set_text(text, `${key() ?? ''} `));
		$.append($$anchor, ww_node);
	});

	var node_1 = $.sibling(node, 2);

	$.each(node_1, 17, () => $.get(wires), (wire) => wire.id, ($$anchor, wire) => {
		var ww_path = root_1();

		$.template_effect(() => $.set_custom_element_data(ww_path, 'data-ww-key', $.get(wire).id));
		$.template_effect(() => $.set_custom_element_data(ww_path, 'from', $.get(wire).from));
		$.template_effect(() => $.set_custom_element_data(ww_path, 'to', $.get(wire).to));
		$.set_custom_element_data(ww_path, 'selectable', true);
		$.set_class(ww_path, 1, 'svelte-4q0ytg');
		$.append($$anchor, ww_path);
	});

	$.reset(ww_scene);
	$.action(ww_scene, ($$node, $$action_arg) => listen?.($$node, $$action_arg), () => handlers);

	var p = $.sibling(ww_scene, 2);
	var text_1 = $.only_child(p, true);

	$.template_effect(() => $.set_text(text_1, $scene().marquee ? "marquee" : "no marquee"));
	$.append($$anchor, fragment);
	$.pop();
	$$cleanup();
}

customElements.define('ww-b-scene', $.create_custom_element(Scene, {}, [], [], { mode: 'open' }, (Base) => withWidgetRuntime(Base)));