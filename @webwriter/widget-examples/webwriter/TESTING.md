# Testing the module examples in WebWriter

This folder is a WebWriter package, `@webwriter/module-examples`. It holds the example widgets of `@webwriter/widget-examples/examples`, one snippet for each, and their editing configuration.

## Build and load

1. In `@webwriter/widget-examples`, run `npm run build:webwriter`. It writes `webwriter/dist/<tag>.js`, one self-contained module per widget. `@webwriter/widget` and `@webwriter/lit` are taken from their sibling folders in this repository (see the README), so the build has their current state.
2. In WebWriter, choose **Develop → Local packages → Load** and pick the folder `@webwriter/widget-examples/webwriter`.
3. Insert the snippets from the insertion menu. They are listed under **Module examples**.

Expected after loading:

- The Developer console shows no warning for the package. "Widgets registered" and "Widget properties reflect to attributes" are both satisfied.
- The insertion menu lists 12 widgets and 15 snippets. "Sort item", "Order exercise", "Choice exercise" and "Poll (no framework)" have no entry of their own. They arrive with a snippet, because an empty one is of no use.
- Running `npm run build:webwriter` again reloads the package in the editor.

## What the headless checks already cover

`node scripts/build.mjs webwriter-package && node test/run.mjs webwriter-package` (also part of `npm test`) runs on the built modules:

- The editor's own loader reads the folder without a warning, and its schema takes the editing configuration.
- Every module loads as the editor loads it and defines its tag. The editor's import-map linking needs no network for them.
- Every snippet passes the editor's sanitizer unchanged, fits the content expressions, and renders without console output. This is checked in an emulated editing frame (`designMode` on, `id` and `contenteditable=""` on each widget) and as a reader sees it.
- The main interaction of each widget works in that emulated frame, and the mutations fall inside one `ww-transactionstart` / `ww-transactionend` pair where one undo step is expected.

They do not cover anything below. The emulation has no real undo stack, no widget drawer, no selection handling, no wheel handling, no preview frame and no live session.

## How the editor treats a widget (read once)

- **Selecting.** A click inside a widget selects ("captures") it, and the widget also gets the click. The drawer then shows the options of that widget. A widget that is selected from outside (Ctrl or ⌘ + click, arrow keys) is covered by a drag surface: the next click only captures it.
- **Children.** A sort item is a widget of its own. A click on its handle selects the item, not the list. To reach the list's drawer and permissions, click the list's own area, for example beside "Sort A–Z".
- **Wheel.** Over a widget that is not selected, the editor keeps the wheel for the page. This applies to every widget here except the sort lists and the stepper, which have editable content.
- **Keys.** While the focus is inside a widget, the editor's own shortcuts do not run, Ctrl/⌘ + Z included. Use the toolbar's Undo, or click into the text first.
- **Undo.** A change that a widget wraps in a transaction is one step. Other changes that follow each other within half a second are merged into one step.

## General (try once)

| # | Try | Expected |
| --- | --- | --- |
| G1 | Scroll the page with the wheel while the pointer crosses an unselected Diagram view or Circuit. | The page scrolls. The widget does not pan or zoom. |
| G2 | Click into the Diagram view, then use the wheel, then Ctrl + wheel (on a Mac also ⌘ + wheel). | The wheel pans the diagram, Ctrl + wheel zooms it at the pointer. ⌘ + wheel: note what happens. Over an unselected widget the editor only exempts Ctrl. |
| G3 | Switch the document language to German and back (no reload). | The text of every widget follows: button names, the Help labels, the exercises' sentences, the labels in the drawer of Epidemic and Countdown card. The modules load the catalog of a language when it is first needed, so their text may be English for a moment. Note it if English stays. |
| G4 | Open the preview. | No widget is in edit mode: author-only controls are gone (see the widgets below), and only what a permission grants works. |
| G5 | Click on a text inside a widget's own interface (a button label, the hint line of Epidemic) and type a letter. | Nothing is typed into the widget's interface. The whole editing frame is in design mode, so note it if text appears there. |
| G6 | Save the document, close it and open it again (the package still loaded). | Every widget comes back as it was. The per-widget lists below say what is kept. Note whether the saved file still loads the widgets: it refers to the local package by a URL of the editor. |
| G7 | Insert Palette, Pairing, Diagram view, Circuit and Swarm from the menu as bare widgets (not their snippets). Press Undo once after each. | The widget is gone. These five write a default attribute on their first render (`shapes`, `links`, `nodes`, `model`, `count`). Note it if the first Undo only removes that attribute and a second one is needed. |

## Sort list (Lit) — snippet "Sort list: fruit"

| # | Try | Expected |
| --- | --- | --- |
| 1 | Drag "Cherry" by its handle (⠿) below "Banana". Undo once, redo once. | One step per drop: undo restores the old order, redo the new one. |
| 2 | Focus a handle, press Space, ArrowDown twice, Enter. Undo once. Then Space, ArrowDown, Escape. | The move is one step. Escape puts the item back and adds no undo step. |
| 3 | Click "Sort A–Z". Undo once. | The whole sort is one step. |
| 4 | Click into an item's text and type. Press Enter at the end of an item, and Backspace in an empty item. | The text is edited in place. Note what Enter and Backspace do: the content expression is `ww-sort-item+`, so a new item and its removal are what is wanted. |
| 5 | Select the list (click beside "Sort A–Z"). Under Distribute, open the element permissions. | "Learners may reorder the items in this widget" is listed and checked (the snippet has `allow-reordering`). |
| 6 | Uncheck the permission and open the preview. Check it again and open the preview. | Without it: no handle drags, "Sort A–Z" is hidden. With it: items can be dragged, "Sort A–Z" stays hidden. |
| 7 | Copy the list and paste it below. Reorder the copy. | The original keeps its order. |

Kept on save: the items, their text and order, `allow-reordering`.

## Sort list (no framework) — snippet "Sort list (no framework): fruit"

Rows 1 to 7 of the Lit list. It must behave the same in every row.

## Palette — snippet "Palette with two shapes"

| # | Try | Expected |
| --- | --- | --- |
| 1 | Drag "Square" from the palette onto the canvas. Undo once. | A square appears on the grid. One undo step removes it. |
| 2 | Drag a placed shape to another place, then drop one on the trash. Undo twice. | One step each. |
| 3 | Drag the slider shape. | It only moves sideways. |
| 4 | Focus a shape on the canvas, press Space, move with the arrow keys, press Enter. Undo once. | One step for the whole keyboard move. |
| 5 | Uncheck "Learners may place, move and delete shapes" and open the preview. | Nothing can be dragged, and the shapes do not look draggable. |
| 6 | Wheel over the canvas while the widget is not selected. | The page scrolls. |

Kept on save: `shapes` (the placed shapes as JSON), `allow-arranging`.

## Pairing — snippet "Pairing: biology terms"

| # | Try | Expected |
| --- | --- | --- |
| 1 | Drag "Cell" to "The smallest unit of life". Undo once. | A line connects them. One undo step removes the link. |
| 2 | Link by keyboard: Space on a term, arrow keys, Enter. Remove a link with its × button. Undo. | One step each. |
| 3 | Link a term to a wrong definition and press "Check". Undo. | The wrong link is removed (one step). The term can no longer be linked to that definition. This memory is not part of the document, so undo brings the link back but not the refusal. |
| 4 | Resize the editor window or the widget. | The lines stay on their boxes. |

Kept on save: `links`, `replace`. The widget has no permission and no drawer entries.

## Diagram view — snippet "Diagram view, learners may pan and zoom"

| # | Try | Expected |
| --- | --- | --- |
| 1 | Drag a node. Undo once. | One step per drag. Nothing is written while the drag runs. |
| 2 | Click "Add", then "Remove". Undo twice. | One step each. |
| 3 | Pan or zoom as the author, wait a second, look at the attributes of the widget. Undo. | The view is saved in the `view` attribute. Undo restores the earlier view. Note how many steps one pan gesture makes. |
| 4 | Press the ? button. With the overlay open, press Escape. | The overlay opens with labels for the toolbar, the stage and the zoom buttons. Escape closes it. Note whether the widget stays selected and whether the editor reacts to the Escape as well. |
| 5 | Focus the stage and press `+`, `-`, `0`. | Zoom in, zoom out, fit. The editor does not type the characters into the document. |
| 6 | Click "Unlock" in the toolbar, then check the permission "Learners may pan and zoom the diagram" under Distribute. Undo. | Both show the same state, the `allow-panning` attribute. A click on "Unlock" is one undo step. |
| 7 | Open the preview with the permission unchecked, then checked. | "Add", "Remove" stay (they are not gated in this example); "Unlock" is hidden. Panning and zooming work only with the permission. Nodes cannot be dragged. |
| 8 | Make the editor narrow. | Help switches to its list form. |

Kept on save: `nodes`, `allow-panning`, `view`.

## Library view — snippet "Library view: map"

| # | Try | Expected |
| --- | --- | --- |
| 1 | Click into the map, then wheel, Ctrl + wheel, and drag. | The map's own input: wheel pans, Ctrl + wheel zooms. |
| 2 | Use the zoom buttons and, with the map focused, `+`, `-`, `0`. | They drive the map. No undo step is made. |
| 3 | Set the `locked` attribute in the attributes panel. | Buttons and keys stop zooming. |

Kept on save: `locked` only. The position of the map is not part of the document.

## Circuit — snippet "Circuit: AND and NOT"

| # | Try | Expected |
| --- | --- | --- |
| 1 | Drag a gate. Undo once. | One step per move. |
| 2 | Select the note, drag one of its handles. Undo once. | One step per resize. |
| 3 | Drag from the output port of NOT to the input of OUT. Undo once. | A wire appears and OUT shows its value. One step. |
| 4 | Tab to a gate, press Space, move it with the arrow keys, press Enter. Then again with Escape at the end. | Enter commits one step. Escape takes the move back without a step. |
| 5 | Shift + drag on the background, then press "Delete selection". Undo once. | The marquee selects. The deletion of gates and their wires is one step. |
| 6 | Click the button of an IN gate. Undo. | The value toggles, the wires change colour. One step. |
| 7 | Uncheck and check "Learners may change the circuit", and look at the preview each time. | Without it a reader can select and pan, but not move, resize, connect, toggle or delete. With it everything works. |
| 8 | Ctrl + wheel on the selected widget, and the zoom buttons. | The board zooms. Nothing is written to the document. |

Kept on save: `model` (gates, wires, note, legend as JSON), `allow-editing`. The selection is not kept.

## Swarm — snippet "Swarm, running and zoomable"

| # | Try | Expected |
| --- | --- | --- |
| 1 | Look at it after inserting. | The creatures move. No notice about WebGL is shown. |
| 2 | Click "Pause", then "Run". Undo twice. | The `running` attribute goes and comes. Each click is one undo step, also two quick ones. |
| 3 | Click the habitat twice. Undo twice. | 100 more creatures per click, `count` follows. Each click is one undo step. |
| 4 | Drag a nest. Save and reopen. | The nest moves. Its place is not kept: nests are not part of the document in this example. |
| 5 | Scroll the widget out of view and back. | It keeps running after it returns. |
| 6 | Open the preview. | It runs there too. |

Kept on save: `count`, `running`, `zoomable`, `fit`.

## Epidemic — snippet "Epidemic, learners may change infectivity"

| # | Try | Expected |
| --- | --- | --- |
| 1 | Select the widget and open the drawer. | Six options with labels: Population, Infectivity, Show chart, Movement, Recovery time (a duration field), Color of the infected. Three action buttons: Play or pause, Restart, Raise infectivity. The drawer shows no shortcut keys; the editor does not read that field. |
| 2 | Drag the infectivity slider in the widget in one go. Undo once. | One step for the whole drag, back to the value before it. |
| 3 | Change Population in the drawer. Undo once. | The widget's number field follows and the simulation restarts. One step. |
| 4 | Turn "Show chart" off in the drawer. Look at the attributes. Undo. | `no-show-chart` appears. One step. This option is written through the property, not an attribute, so check that undo really is a single step. |
| 5 | Set Population below 20. | "Movement" is disabled in the drawer with the reason "Needs at least 20 people". |
| 6 | Click the simulation, then press Space, R, and Ctrl or ⌘ + ArrowUp. | Play or pause, restart, infectivity + 0.05 (one undo step). The page does not scroll on Space. |
| 7 | Put the caret into a paragraph of the document and press Space and R. | They are typed into the text. The widget does not react. |
| 8 | Uncheck "Learners may change infectivity in this widget" and open the preview; check it and open the preview. | Without it the slider and the hint line are hidden and the key does nothing. With it the slider and Ctrl or ⌘ + ArrowUp work. The other settings controls are always hidden for a reader. |

Kept on save: `population`, `infectivity`, `no-show-chart`, `movement`, `recovery`, `accent`, `allowinfectivity`. The state of the simulation is not kept.

## Stepper — snippet "Stepper: five steps"

| # | Try | Expected |
| --- | --- | --- |
| 1 | Click the border of the step box (not the text), then press ArrowRight, ArrowLeft, Space, Home. | Next step, previous step, play or pause, first step. |
| 2 | Click into the text of the step and press ArrowRight and Space. | The caret moves and a space is typed. The stepper does not react. |
| 3 | Edit the text of a step. Press Enter at its end and type. | The text is edited in place. Enter makes a new step, which is shown at once with the caret in it. The slider gets one more position. |
| 4 | Delete a whole step (empty it, then Backspace). | The neighbouring step is shown. Note whether the last remaining step can be removed: the content expression is `p+`. |
| 5 | Open the drawer. | One action button, "Play or pause". The three navigation actions are hidden. |
| 6 | Play in the preview. | The steps advance by themselves. Nothing is written to the document. |

Kept on save: the paragraphs, `interval`. The current step is not kept.

## Media stepper — snippet "Media stepper: three seconds of silence"

| # | Try | Expected |
| --- | --- | --- |
| 1 | Press play, drag the slider, press the rate button. | The time runs to 0:03. The slider seeks. Nothing is written to the document. |
| 2 | Save and reopen. | It works again: the audio is generated in the browser, no `src` is written. |

## Countdown card — snippet "Countdown card: reading time"

| # | Try | Expected |
| --- | --- | --- |
| 1 | Open the drawer. | An option "Caption" and one option per setting, in the groups "Time" and "Look": text, multi-line text, duration, time, date, date and time, a list with several choices, a range with fixed steps (16, 24, 40, 64 px), switches, a segmented choice, a nested choice, a tree, a colour with swatches, pattern, e-mail, URL, phone, password, and a reference to another Countdown card. |
| 2 | Type a heading in the widget's own field, key by key. Undo once. | One step for the whole entry (it ends on blur, on Enter or after a pause). |
| 3 | Change the same setting in the drawer. | The widget's field shows the new value. |
| 4 | Turn "Sound" off. | "Volume" is disabled in the drawer with the reason "The sound is off", and in the widget. |
| 5 | Insert a second card and choose it under "Starts after". Then copy and paste a card. | The reference lists the other card by its id. After a paste, note whether both cards have the same id: the editor gives new ids only to widgets with a data block. |
| 6 | Uncheck and check "Learners may change the volume in this widget", and look at the preview. | The volume slider is hidden without the permission. |

Kept on save: every setting as its attribute (`heading`, `length`, `no-sound`, …), `allow-volume`.

## Order exercise — snippet "Order exercise: making tea"

| # | Try | Expected |
| --- | --- | --- |
| 1 | In the editor, drag an entry. Undo once. | The same drag records the solution: the `solution` attribute changes (it is obfuscated). One step. No response is written. |
| 2 | Open the drawer. | Options: Feedback, Required, Shuffle for each reader. Actions: Check, Reset, Show solution. |
| 3 | Open the preview, order the entries, press "Check", then "Reset". | The entries are marked right or wrong, a summary is shown, Reset clears it. |
| 4 | Check "Learners may reveal the solution" and open the preview. | "Show solution" appears and shows the order. |
| 5 | Start a live session, answer as a participant, and open the aggregated view. | The response is kept per participant, and the view shows the orderings against the entries. The document's own data block stays `{}`. |
| 6 | Answer in the preview, close the preview, open it again. | Note whether the answer is still there. In the preview the data block is not managed by the editor. |
| 7 | Copy and paste the exercise. | The copy has a new id and an empty response. Its solution is the same. |
| 8 | Switch the document language to German. | The sentences, the buttons and the drawer labels are German. |

Kept on save: the entries, `solution`, `shuffle`, `feedback`, `required`, `allow-solution`, and the data block with its authored default `{}`. The entries cannot be edited in the editor: they are `<data>` children that the widget reads but does not show through a slot.

## Choice exercise — snippet "Choice exercise: planets"

| # | Try | Expected |
| --- | --- | --- |
| 1 | In the editor, tick another answer. Undo once. | The tick records the solution. One step. |
| 2 | Turn on "Several answers" in the drawer. | Radio buttons become checkboxes. One step. |
| 3 | In the preview, tick and press "Check". | The answer is marked. A spoken summary is in the paragraph below. |
| 4 | Use the reader's Submit, if the preview or the exported document offers one. | The widget gets `submitted` and locks. With Feedback set to "after submitting", the marks appear only then. |
| 5 | Live session and aggregated view. | The view shows how often each choice was ticked. |

Kept on save: as for the order exercise, and `multiple`.

## Poll (no framework) — snippet "Poll: drinks"

| # | Try | Expected |
| --- | --- | --- |
| 1 | Vote in the editor. Undo. | The button is pressed. The vote is participant data: the document's block stays `{}`, and undo takes the vote back. |
| 2 | Reload the editor with the same document. | Note whether the vote is still there. The editor keeps participant data of the editing frame in the browser. |
| 3 | Vote as two participants of a live session. | Each has an own vote. |
| 4 | Copy and paste the poll. | The copy has a new id and no vote. |

Kept on save: the choices and the data block `{}`.
