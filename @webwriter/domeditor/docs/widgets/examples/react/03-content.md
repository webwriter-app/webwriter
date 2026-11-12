Replace the fixed question with a native slot in the React view. The slot displays the question in the shadow root. The question stays in the light DOM. The slot displays its default text when the widget has no question.

~~~jsx
<slot><p>Add a question.</p></slot>
~~~

The complete widget is in `03-content.jsx`. It keeps the answer controls and styles in the shadow root.
