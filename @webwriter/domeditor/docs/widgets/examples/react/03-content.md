Replace the hard-coded question with a native slot in the React render. The document’s question stays in the widget’s authored light DOM and is projected into the shadow root; the fallback appears only when no question was supplied.

~~~jsx
<slot><p>Add a question.</p></slot>
~~~

03-content.jsx is the complete standalone widget for this step. It keeps the answer controls and styling in the shadow root.
