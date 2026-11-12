This example defines the custom element `ww-hello`. A slot displays the widget's child content. Add React and React DOM to the package.

~~~json
{
  "dependencies": {
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  }
}
~~~

The source in `hello.jsx` [starts React](https://react.dev/reference/react-dom/client/createRoot) in the shadow root.

~~~jsx
this.attachShadow({mode: "open"})
this.mount = document.createElement("div")
this.shadowRoot.append(this.mount)
this.root = createRoot(this.mount)
this.root.render(<p>Hello, <slot>world</slot>!</p>)
~~~

The custom element calls [`root.unmount()`](https://react.dev/reference/react-dom/client/createRoot#root-unmount) when it disconnects. It creates a new React root when it connects again. The child text stays in the light DOM.

Run the build script before you load the package. The build compiles JSX and bundles React and React DOM into a browser module.
