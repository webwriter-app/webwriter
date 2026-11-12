# Support live sessions

Let a host see how learners are using your widget, either as individual snapshots
or as an aggregated view of their responses.

![Three workshop votes feed a live tally](../../images/widgets/live-sessions.svg)

## Let authors choose what participants can do

Declare `static permissions` to give the author control over an optional widget
interaction. A workshop activity can offer a glossary that the author turns on
or off for participants.

<iframe title="Workshop activity with an optional participant glossary" src="../examples/preview.html?guide=live-sessions" width="100%" height="360" loading="lazy"></iframe>

[Open the participant controls demo](../examples/preview.html?guide=live-sessions) · [View the example source](../examples/guide-live-sessions.js)

The demo's author checkbox simulates the setting by adding or removing
`allow-glossary` on the widget. Open the glossary in the participant view, then
uncheck **Allow glossary** to see it close and disappear.

1. Select the widget in the editor and open **Distribute**.
2. Open the permissions drawer named for the selected widget. Under
   **Permissions**, find **Allow glossary** just below **Edit** and toggle it.
   The widget setting works independently of **Edit** and is unavailable when
   **View** is off for the widget.
3. Start a live session from **Preview** and join as a participant to check that
   the glossary follows the setting.

Key the declaration by boolean property name and name the corresponding HTML
attribute. The editor adds an empty attribute when the checkbox is checked and
removes it when unchecked. In the widget, reflect the property to the attribute
and observe attribute changes so the participant view updates when the editor
changes the markup.

```js
static permissions = {
  allowGlossary: {
    attribute: "allow-glossary",
    label: {_: "Allow glossary"},
    description: {_: "Let participants open a glossary during the activity."},
  },
}

static observedAttributes = ["allow-glossary"]

get allowGlossary() {
  return this.hasAttribute("allow-glossary")
}

set allowGlossary(value) {
  this.toggleAttribute("allow-glossary", Boolean(value))
}
```

In `attributeChangedCallback()`, use `this.allowGlossary` to show or hide the
glossary disclosure. In authored HTML, `<ww-workshop-glossary allow-glossary>`
enables it. Use the [element permissions reference](../reference/options-actions.md#element-permissions)
for the full declaration. These flags control the interactions the widget offers.
WebWriter's distribution permissions govern document edits, and any service the
widget calls must enforce its own authorization.

## Save participant responses

Store persistent participant data in a direct data block, and enable `sharedData: true` in
the widget's [editing configuration](../reference/editing-configuration.md). For example, a workshop poll can store each participant’s vote for the next activity:

```html
<ww-workshop-poll>
  <p>Choose the next workshop activity.</p>
  <script type="application/json" slot="data">{"activity":""}</script>
</ww-workshop-poll>
```

Leave `shared` absent when each participant should keep their own data. Use the
[participant data guide](sharing.md) to choose a sharing mode and implement data
handlers. Wait for ready data before writing, and render accepted changes without
writing them back. Live sessions capture those changes, including remote updates
and undo or redo; temporary properties and shadow DOM are not the aggregation
interface.

## Submit responses from the reader

Set `static formAssociated = true` on the custom element class to include it in the reader's
**Submit** action. An authored HTML form can group widgets with ordinary inputs
for validation.

```html
<form>
  <ww-workshop-poll name="activity" required>
    <p>Choose the next workshop activity.</p>
    <script type="application/json" slot="data">{"activity":""}</script>
  </ww-workshop-poll>
</form>
```

Use `ElementInternals.setValidity()` to report invalid input, such as a missing
required selection, and forward `reportValidity()` so the reader can show the validation message.
For ordinary HTML forms, give the widget a `name` and publish its response with
`ElementInternals.setFormValue()`. A widget that submits multiple values can pass `FormData`
with one entry for each selected option.

After the learner confirms, the reader adds the boolean `submitted` attribute
and dispatches a non-bubbling `submit` event on each participating widget. A
widget can use the event for immediate feedback or observe the attribute to
show feedback when a snapshot is restored. Remove the attribute when the
response changes. For the workshop poll, the submitted state can show a confirmation such as “Vote submitted.”

In a live session, the attribute travels with the learner's widget snapshot.
Keep the response in the widget's data block so the host and replay can read it
alongside the marker.

## Declare an aggregated view

Add `static aggregate` to your widget class. Choose a shape and extract the
value you want to compare. This declaration tallies the workshop poll votes:

```js
static aggregate = {
  shape: "selection",
  title: "Activity votes",
  items: [
    {id: "drawing", label: "Drawing"},
    {id: "collage", label: "Collage"},
  ],
  value: data => data?.activity || undefined,
}
```

Returning `undefined` from `value` omits samples without a selection. To highlight
a comparison value, declare an optional `reference` explicitly. When `aggregate`
is a function, it receives read-only snapshots, so it can adapt labels and the
reference to the authored widget.

Return an array of configurations to offer several views of one widget. Give
each configuration a `title` and a stable `id` (the shape name is the default ID).
The host selects a view in the widget's live-session selector.

The [Aggregated View reference](../reference/aggregated-view.md) lists the seven
shapes and their inputs. For widget-specific graphics, choose `custom` and
register a separate rendering element that receives the aggregate context.

## Check the live view

Start a live session from **Preview**, join as several learners, and submit
different responses. The host can choose a declared aggregated view, **Thumbnail
wall**, or an individual learner for each widget. Without a declaration, or if one fails,
WebWriter shows learner thumbnails.

Check that changing the learner filter updates the chart and that replay shows
the responses at the selected time. Also try missing responses, remote data
changes, and undo or redo. Shared data contribute one response per shared
scope rather than one duplicate per learner.

Keep aggregate rendering read-only. WebWriter places its views in the shadow
appendix, and aggregation does not change the widget's data, history, or exported
HTML. For a custom renderer, check narrow containers and clean up observers and
listeners when the renderer disconnects.
