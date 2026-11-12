# Widgets

Widgets add interactive content to a web document. They are [Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components). An [npm package](https://docs.npmjs.com/about-packages-and-modules/) can contain one or more widgets.

The [Library](introduction/library.md) page describes the six choices in the library selector. The widget interface, document HTML, and CSS use the same web standards for all six choices. The [Quick start](introduction/quick-start.md) shows how to add a widget to a document. The [Tutorial](tutorial/index.md) shows how to make a complete widget. Both include source code and a live preview for each library. The [Guides](guides/index.md) give instructions for specific widget features. The [Reference](reference/index.md) describes the package interface, runtime interface, and tools.

## What is a widget?

A widget is an HTML [custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements). Its class can extend [`HTMLElement`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement) directly or use a base class from a library such as [Lit](https://lit.dev/docs/components/defining/). A widget can use the web APIs that the browser supplies.

```html
<ww-weather place="Utrecht">
  <p>Schoolyard forecast</p>
</ww-weather>
```

The tag name identifies the widget. [Attributes](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes) can store settings. Child nodes can hold content from the author. The widget can use a [shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM) for its user interface.

A widget package can also include HTML snippets, style sheets, and tests. The authoring tool uses the package to find and load the widgets.

The HTML document holds each widget and its saved settings. Widgets and authors can change this HTML. The authoring tool can undo or redo a change.

### What widgets can do

<nav class="widget-capabilities" aria-labelledby="what-widgets-can-do">
  <div class="widget-capabilities-map">
    <div class="widget-capabilities-core">
      <div class="widget-capabilities-document">
        <strong class="widget-capabilities-document-title">HTML document</strong>
        <div class="widget-capabilities-lines" aria-hidden="true"></div>
        <div class="widget-capabilities-example">
          <div class="widget-capabilities-example-title"><strong>Widget</strong><code>&lt;ww-weather&gt;</code></div>
          <div class="widget-capabilities-example-output" aria-hidden="true">
            <strong>Schoolyard forecast</strong>
            <span>Utrecht · 12 °C · Cloudy</span>
          </div>
        </div>
        <div class="widget-capabilities-lines" aria-hidden="true"></div>
      </div>
    </div>
    <div class="widget-capabilities-rail widget-capabilities-left">
      <h4>Authoring</h4>
      <ul>
        <li>
          <a href="guides/editing.md" aria-describedby="widget-guide-editing">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#editing"></use></svg>
            <template><img src="../images/widgets/editing.svg" alt=""></template>
            <span>Support editing</span>
          </a>
          <p id="widget-guide-editing" class="widget-capabilities-summary">A widget can show different controls to authors and readers.</p>
        </li>
        <li>
          <a href="guides/focus.md" aria-describedby="widget-guide-focus">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#focus"></use></svg>
            <template><img src="../images/widgets/focus.svg" alt=""></template>
            <span>Handle selection &amp; input</span>
          </a>
          <p id="widget-guide-focus" class="widget-capabilities-summary">A widget can move focus to a control and handle input from a keyboard.</p>
        </li>
        <li>
          <a href="guides/content.md" aria-describedby="widget-guide-content">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#content"></use></svg>
            <template><img src="../images/widgets/content.svg" alt=""></template>
            <span>Nest content</span>
          </a>
          <p id="widget-guide-content" class="widget-capabilities-summary">Slots can show editable text and other widgets from the light DOM.</p>
        </li>
        <li>
          <a href="guides/conversions.md" aria-describedby="widget-guide-conversions">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#conversions"></use></svg>
            <template><img src="../images/widgets/conversions.svg" alt=""></template>
            <span>Convert &amp; import/export</span>
          </a>
          <p id="widget-guide-conversions" class="widget-capabilities-summary">A widget can convert content to and from HTML or a file.</p>
        </li>
      </ul>
      <h4>Presentation</h4>
      <ul>
        <li>
          <a href="guides/responsiveness.md" aria-describedby="widget-guide-responsiveness">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#responsiveness"></use></svg>
            <template><img src="../images/widgets/responsiveness.svg" alt=""></template>
            <span>Make layouts responsive</span>
          </a>
          <p id="widget-guide-responsiveness" class="widget-capabilities-summary">A widget can change its layout to fit the available space.</p>
        </li>
        <li>
          <a href="guides/theming.md" aria-describedby="widget-guide-theming">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#theming"></use></svg>
            <template><img src="../images/widgets/theming.svg" alt=""></template>
            <span>Follow the theme</span>
          </a>
          <p id="widget-guide-theming" class="widget-capabilities-summary">A widget can use the fonts and colors from the document theme.</p>
        </li>
        <li>
          <a href="guides/localization.md" aria-describedby="widget-guide-localization">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#localization"></use></svg>
            <template><img src="../images/widgets/localization.svg" alt=""></template>
            <span>Localize a widget</span>
          </a>
          <p id="widget-guide-localization" class="widget-capabilities-summary">A widget can show its text in the document language.</p>
        </li>
        <li>
          <a href="guides/printing.md" aria-describedby="widget-guide-printing">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#printing"></use></svg>
            <template><img src="../images/widgets/printing.svg" alt=""></template>
            <span>Support printing</span>
          </a>
          <p id="widget-guide-printing" class="widget-capabilities-summary">Print styles can show the widget content on paper or in a PDF.</p>
        </li>
      </ul>
    </div>
    <div class="widget-capabilities-rail widget-capabilities-right">
      <h4>State and participation</h4>
      <ul>
        <li>
          <a href="guides/state.md" aria-describedby="widget-guide-state">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#state"></use></svg>
            <template><img src="../images/widgets/state.svg" alt=""></template>
            <span>Manage state</span>
          </a>
          <p id="widget-guide-state" class="widget-capabilities-summary">A widget can store its state and supply options and actions to the authoring tool.</p>
        </li>
        <li>
          <a href="guides/sharing.md" aria-describedby="widget-guide-sharing">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#sharing"></use></svg>
            <template><img src="../images/widgets/sharing.svg" alt=""></template>
            <span>Share participant data</span>
          </a>
          <p id="widget-guide-sharing" class="widget-capabilities-summary">A widget can store data for one participant, a group, or all participants.</p>
        </li>
        <li>
          <a href="guides/live-sessions.md" aria-describedby="widget-guide-live-sessions">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#live-sessions"></use></svg>
            <template><img src="../images/widgets/live-sessions.svg" alt=""></template>
            <span>Support live sessions</span>
          </a>
          <p id="widget-guide-live-sessions" class="widget-capabilities-summary">A widget can give participants controls and show their responses to the host.</p>
        </li>
        <li>
          <a href="guides/reactivity.md" aria-describedby="widget-guide-reactivity">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#reactivity"></use></svg>
            <template><img src="../images/widgets/reactivity.svg" alt=""></template>
            <span>Make data reactive</span>
          </a>
          <p id="widget-guide-reactivity" class="widget-capabilities-summary">A signal can update one widget when a value changes in another widget.</p>
        </li>
      </ul>
      <h4>Build and distribution</h4>
      <ul>
        <li>
          <a href="guides/libraries.md" aria-describedby="widget-guide-libraries">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#libraries"></use></svg>
            <template><img src="../images/widgets/libraries.svg" alt=""></template>
            <span>Manage dependencies</span>
          </a>
          <p id="widget-guide-libraries" class="widget-capabilities-summary">A widget can load libraries and assets as necessary. An offline document can include only the code it needs.</p>
        </li>
        <li>
          <a href="guides/testing.md" aria-describedby="widget-guide-testing">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#testing"></use></svg>
            <template><img src="../images/widgets/testing.svg" alt=""></template>
            <span>Test and debug</span>
          </a>
          <p id="widget-guide-testing" class="widget-capabilities-summary">Package tests can help you find problems in a widget.</p>
        </li>
        <li>
          <a href="guides/migrations.md" aria-describedby="widget-guide-migrations">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#migrations"></use></svg>
            <template><img src="../images/widgets/migrations.svg" alt=""></template>
            <span>Migrate widget content</span>
          </a>
          <p id="widget-guide-migrations" class="widget-capabilities-summary">A migration can update widget HTML from an earlier version and keep the document content.</p>
        </li>
        <li>
          <a href="guides/publishing.md" aria-describedby="widget-guide-publishing">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#publishing"></use></svg>
            <template><img src="../images/widgets/publishing.svg" alt=""></template>
            <span>Publish a widget</span>
          </a>
          <p id="widget-guide-publishing" class="widget-capabilities-summary">You can publish a widget package or embed the widget on a website.</p>
        </li>
      </ul>
    </div>
  </div>
  <div class="widget-capabilities-preview" popover="manual" hidden aria-hidden="true"></div>
</nav>
