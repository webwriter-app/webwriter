This complete React quick start defines ww-hello and projects its authored content through a slot. Add React and React DOM to the package:

~~~json
{
  "dependencies": {
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  }
}
~~~

The source in hello.jsx uses the same shadow-root lifecycle as the tutorial widget:

~~~jsx
this.attachShadow({mode: "open"})
this.mount = document.createElement("div")
this.shadowRoot.append(this.mount)
this.root = createRoot(this.mount)
this.root.render(<p>Hello, <slot>world</slot>!</p>)
~~~

On removal it calls root.unmount(); reconnecting creates a fresh root. The default slot leaves authored light-DOM text untouched.

Bundle React and React DOM with the supplied build script before loading the package. The build compiles JSX and bundles its dependencies into a browser-ready module.
