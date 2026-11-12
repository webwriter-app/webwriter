Use the same custom-element class. Replace the first paragraph with a React view. The function component returns the quiz question, answer controls, and output. Put the CSS in a `style` element inside the shadow root. The `:host` selector applies styles to the widget element.

~~~jsx
function ReactQuiz() {
  return <section>
    <style>{styles}</style>
    <p>The Moon is a star.</p>
    <div className="controls">
      <button type="button" value="true">True</button>
      <button type="button" value="false">False</button>
    </div>
    <output aria-live="polite" />
  </section>
}
~~~

The complete source is in `02-rendering.jsx`. The source uses `createRoot` when the custom element connects.
