Keep the same custom-element class and replace its initial paragraph with a React render. The function component returns the quiz question, answer controls, and live output; the CSS is a string rendered into a style element inside the shadow root. The :host selector styles the widget boundary.

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

02-rendering.jsx is a complete standalone step and uses createRoot in the custom element lifecycle.
