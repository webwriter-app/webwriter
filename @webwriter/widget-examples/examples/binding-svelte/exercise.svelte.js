import 'svelte/internal/disclose-version';
import { withDeclarations, withWidgetRuntime } from "@webwriter/svelte";
import { exerciseStore, scoreOf, withExercise } from "@webwriter/svelte/exercise";
import * as $ from 'svelte/internal/client';

var root = $.from_html(`<button class="choice"> </button>`);
var root_1 = $.from_html(`<!> <button class="check">Check</button> <output> </output> <p class="state"> </p>`, 1);

export default function Exercise($$anchor, $$props) {
	$.push($$props, true);

	const $exercise = () => $.store_get(exercise, '$exercise', $$stores);
	const [$$stores, $$cleanup] = $.setup_stores();
	const host = $$props.$$host;
	let response = $.state(undefined);
	let solution = $.state("b");

	const exercise = exerciseStore(host, {
		response: () => $.get(response),
		respond: (value) => $.set(response, value, true),
		solution: () => $.get(solution),
		record: (value) => $.set(solution, value, true),
		score: (value, expected) => scoreOf([value === expected])
	});

	host.exercise = exercise;

	var fragment = root_1();
	var node = $.first_child(fragment);

	$.each(node, 16, () => ["a", "b", "c"], $.index, ($$anchor, choice) => {
		var button = root();
		var text = $.only_child(button, true);

		$.template_effect(() => {
			button.disabled = $exercise().locked;
			$.set_text(text, choice);
		});

		$.delegated('click', button, () => exercise.answer(choice));
		$.append($$anchor, button);
	});

	var button_1 = $.sibling(node, 2);
	var output = $.sibling(button_1, 2);
	var text_1 = $.only_child(output, true);
	var p = $.sibling(output, 2);
	var text_2 = $.only_child(p);

	$.template_effect(() => {
		$.set_text(text_1, $exercise().summary);
		$.set_text(text_2, `${$exercise().locked ? "locked" : "open"} ${$.get(response) ?? "-" ?? ''}`);
	});

	$.delegated('click', button_1, () => exercise.check());
	$.append($$anchor, fragment);
	$.pop();
	$$cleanup();
}

$.delegate(['click']);

customElements.define('ww-b-exercise', $.create_custom_element(Exercise, {}, [], [], { mode: 'open' }, (Base) => class Quiz extends withExercise(withDeclarations(withWidgetRuntime(Base))) {
	static actions = {
		clear: { label: (widget) => ({ _: `Clear ${widget.noun}` }) }
	};

	noun = "answer";

	clear() {}
}));