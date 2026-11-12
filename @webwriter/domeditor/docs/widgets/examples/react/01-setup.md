The script defines a custom element. React uses `createRoot` to render JSX in a container inside the shadow root. The build compiles JSX and bundles React and React DOM for the browser.

Add React and React DOM to the widget package.

~~~json
{
  "dependencies": {
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  }
}
~~~

The source in `01-setup.jsx` imports React DOM. The element renders the first paragraph in `connectedCallback` and unmounts React in `disconnectedCallback`. The element creates a new React root when it connects again.
