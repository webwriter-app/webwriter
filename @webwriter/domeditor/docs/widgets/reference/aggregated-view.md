# Aggregated View

Widgets can declare how their participant data is shown together in the live
editor. Put the declaration on the custom-element class as `static aggregate`.
A declaration can be one configuration, a readonly list of configurations, or
a synchronous function receiving the current context and returning either form:

```ts
static aggregate = {
  shape: "selection",
  items: [
    {id: "a", label: "Option A"},
    {id: "b", label: "Option B"},
  ],
}
```

For function declarations, the context contains the current widget and response
snapshots, described below.

## Multiple views

Each configuration may include an optional `id`. IDs must be unique, nonempty
strings of at most 128 characters. Without an ID, the shape name is used, so
repeated shapes need explicit IDs. A list can contain up to 50 configurations;
unsupported future shapes are skipped so supported entries remain available.
An empty list, or a declaration containing only unsupported shapes, has no
aggregate view. A single configuration remains fully compatible with existing
widgets.

The first supported configuration is selected by default. A requested view ID
selects its matching configuration; an unknown ID falls back to the first
supported configuration. Each option uses `title` as its display name, falling
back to the shape name when no title is provided. The renderer can discover the
full option list independently of resolving the selected view, so a malformed
configuration does not hide the other choices.

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

The context provided to declaration functions contains:

| Field | Contents |
|---|---|
| `widget` | The widget's `id`, string `attributes`, and authored `html`. |
| `participants` | `{id, name}` records for the participants in this view. |
| `samples` | Independent response records, each with `id`, `learners`, parsed `value`, and a `data` snapshot. |
| `missing` | Number of participant snapshots that are pending, unavailable, invalid, or cannot be assigned to a response scope. |
| `reference` | The explicitly configured reference value, when one is provided. |

The context and its snapshots are read-only. A sample's `data` contains its
`status`, `format`, `mode`, optional `scopeId`, and raw `text`. JSON text is
parsed to `unknown` before it is placed in `value`; XML remains a raw string.
The `value(data, sample)` extractor receives each sample's parsed value and
returns the value used by the shape. For XML, provide an extractor to parse or
otherwise convert the raw string. Non-distance shapes need an extracted value
when their input is XML. If an extractor returns `undefined`, that sample is
omitted and its learners are added to `missing`.

## Shapes

Every configuration can set a `title`, a `value(data, sample)` extractor, and
an explicit `reference` in the extracted value's format. Without `value`, the
parsed JSON value (or raw XML string) is used. A reference is never inferred
from widget defaults or from participant answers.

| Shape | Configuration | Accepted extracted values and display |
|---|---|---|
| `selection` | `items: [{id, label}, ...]` | A scalar item ID or an array of item IDs. Shows the distribution of selected items. |
| `ordering` | `items: [{id, label}, ...]` | An ordered array of item IDs. Shows submitted orderings against the declared items. |
| `number` | Optional `bins` | Finite numbers. Shows their distribution; `bins` controls the number of bins. |
| `text` | None | Strings. Shows submitted text and word frequencies. |
| `spatial` | `bounds: {width, height}`, optional `columns` and `rows` | A point `{x, y}` or an array of points. Coordinates are interpreted within the declared bounds and shown as a spatial distribution. `columns` and `rows` control its grid. |
| `distancemap` | Optional `distance(a, b)` or `distances` matrix | Numeric feature vectors are compared with Euclidean distance by default. Supply a distance function for another metric, or a symmetric distance matrix in sample order. When neither is supplied, values use the default structural distance. The view supports up to 300 independent responses. |
| `custom` | `element: "tag-name"` | Creates the named custom element and assigns the read-only aggregate context to its `aggregate` property. |

For a distance matrix, provide one row and column per sample, in the order of
`context.samples`. The matrix must be square, symmetric, finite, non-negative,
and have a zero diagonal. A custom distance function receives pairs of
extracted sample values.
Distance maps with more than 300 independent responses fall back to the
thumbnail wall.

## Quiz example

This quiz records a choice in its JSON data block. Its correct answer is an
authored `answer` attribute, so the aggregate uses that value as an explicit
reference rather than treating participant defaults as the answer:

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

With no `shared` attribute, each learner has an independent answer. See
[data and events](data.md) for the data-block and scope contract.

## Custom renderer

The custom element must be registered in the widget's scoped registry or in the
global registry. With `LitElementWw`, register it through `static scopedElements`
so it is available in that widget's registry:

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

The runtime assigns `aggregate` before connecting the renderer. Treat it as
read-only; render from the supplied snapshot and do not write aggregate results
back to the widget's data block.
