The React script still defines a browser custom element. The element owns its shadow root, while React renders into a mount point inside that root. React 19 uses createRoot; JSX makes the rendered view read like the markup it produces. React and React DOM publish package entry modules, so the package build compiles JSX and bundles their dependencies into a browser-ready export.

Add React and React DOM to the widget package:

~~~json
{
  "dependencies": {
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  }
}
~~~

The self-contained source in 01-setup.jsx imports React DOM, renders the initial paragraph in connectedCallback, and unmounts React in disconnectedCallback. Reconnection creates a fresh root.
