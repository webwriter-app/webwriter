# B3. Aggregated View

The authoring tool can show participant data from a widget in an Aggregated View. Declare `static aggregate` on the [custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements) class.

The declaration can be one configuration or a read-only list of configurations. It can also be a synchronous function that receives the current context and returns either form.

```ts
static aggregate = {
  shape: "selection",
  items: [
    {id: "a", label: "Option A"},
    {id: "b", label: "Option B"},
  ],
}
```

For a function declaration, the context contains the current widget and response snapshots.

## Multiple views

Each configuration can have an `id`. Use a unique string of 1 to 128 characters for each ID. A configuration with no ID uses its shape name. Give repeated shapes explicit IDs.

A list can contain up to 50 configurations. The authoring tool skips unsupported shapes. The authoring tool needs at least one supported configuration to show an Aggregated View. An existing widget can continue to use one configuration.

The authoring tool selects the first supported configuration by default. A view ID selects its configuration. If the authoring tool cannot find the ID, it selects the first supported configuration. A view uses `title` as its display name. If the configuration has no title, the view uses the shape name. Other choices remain available if one configuration is invalid.

```ts
static aggregate = [
  {
    id: "answer-choice",
    title: "Answer choices",
    shape: "selection",
    items: [
      {id: "a", label: "Option A"},
      {id: "b", label: "Option B"},
    ],
  },
  {
    id: "answer-text",
    title: "Written explanations",
    shape: "text",
    value: data => data?.explanation,
  },
] as const
```

The context for declaration functions contains these fields.

| Field | Contents |
|---|---|
| `widget` | The widget's `id`, string `attributes`, and authored `html`. |
| `participants` | `{id, name}` records for the participants in this view. |
| `samples` | Independent response records, each with `id`, `learners`, parsed `value`, and a `data` snapshot. |
| `missing` | Number of participant snapshots that are pending, unavailable, invalid, or cannot be assigned to a response scope. |
| `reference` | The explicitly configured reference value, when one is provided. |

The context and its snapshots are read-only. A sample's `data` contains its `status`, `format`, `mode`, optional `scopeId`, and raw `text`. The authoring tool parses [JSON](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON) into `value` with the type `unknown`. For XML, `value` is the raw string.

The `value(data, sample)` extractor receives the sample's value. It returns the value for the shape. For XML input in shapes other than `distancemap`, provide an extractor that converts the string. If the extractor returns `undefined`, the view omits that sample. The participants for that sample add to `missing`.

## Shapes

Each configuration can set a `title` and a `value(data, sample)` extractor. It can also set an explicit `reference` in the same format as the extracted value. Without an extractor, the view uses the parsed JSON or the raw XML string. Supply a reference explicitly when the view needs one.

| Shape | Configuration | Accepted extracted values and display |
|---|---|---|
| `selection` | `items: [{id, label}, ...]` | A scalar item ID or an array of item IDs. Shows the distribution of selected items. |
| `ordering` | `items: [{id, label}, ...]` | An ordered array of item IDs. Shows submitted orderings against the declared items. |
| `number` | Optional `bins` | Finite numbers. Shows the distribution of the numbers. `bins` sets the number of bins. |
| `text` | None | Strings. Shows submitted text and word frequencies. |
| `spatial` | `bounds: {width, height}`, optional `columns` and `rows` | A point `{x, y}` or an array of points. Shows a spatial distribution within the declared bounds. `columns` and `rows` set the grid. |
| `distancemap` | Optional `distance(a, b)` or `distances` matrix | Uses Euclidean distance for numeric feature vectors by default. For other values, the default is structural distance. Supply a distance function or a symmetric distance matrix to change the metric. The view supports up to 300 independent responses. |
| `custom` | `element: "tag-name"` | Creates the named custom element and assigns the read-only aggregate context to its `aggregate` property. |

For a distance matrix, supply one row and one column per sample in `context.samples` order. Use a square and symmetric matrix. Use only finite, non-negative values. Put zeros on the diagonal.

A custom distance function receives pairs of extracted sample values. For more than 300 independent responses, the authoring tool shows participant thumbnails.

## Quiz example

This quiz records a choice in its JSON data block. The authored `answer` attribute gives the correct answer. The configuration uses it as the explicit reference.

```js
class WwQuiz extends HTMLElement {
  static aggregate = context => ({
    shape: "selection",
    title: "Quiz answers",
    items: [
      {id: "a", label: "Option A"},
      {id: "b", label: "Option B"},
      {id: "c", label: "Option C"},
    ],
    value: data => data?.choice || undefined,
    reference: context.widget.attributes.answer,
  });
}
```

```html
<ww-quiz answer="b">
  <script type="application/json" slot="data">{"choice":""}</script>
</ww-quiz>
```

With no `shared` attribute, each participant has an independent answer. [Data and events](data.md) describes the data block and its scopes.

## Custom renderer

Register the custom element in the widget's [scoped registry](https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry/CustomElementRegistry) or in the global registry. With [`LitElementWw`](lit.md#litelementww), use `static scopedElements` to register it in the widget's registry.

```js
import {LitElementWw} from "@webwriter/lit";

class AnswerSummary extends HTMLElement {
  connectedCallback() {
    this.renderSummary(this.aggregate);
  }

  renderSummary(context) {
    this.textContent = `${context.samples.length} responses`;
  }
}

class WwQuiz extends LitElementWw {
  static scopedElements = {"ww-answer-summary": AnswerSummary};
  static aggregate = {
    shape: "custom",
    element: "ww-answer-summary",
    title: "Answer summary",
  };
}
```

The authoring tool sets `aggregate` before it connects the renderer. The snapshot is read-only. Use it as input to the renderer only.
