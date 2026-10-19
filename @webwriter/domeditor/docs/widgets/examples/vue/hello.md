The Vue quick start is a single-file component. Its native slot projects authored light-DOM content through the custom element’s shadow root.

Add Vue to the widget package:

~~~json
{
  "dependencies": {
    "vue": "^3.5.44"
  }
}
~~~

Save the template as hello.vue:

~~~vue
<template>
  <p>Hello, <slot>world</slot>!</p>
</template>
~~~

The small registration module turns the component into a browser custom element:

~~~js
import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import VueHello from "./hello.vue"

const WwHello = defineCustomElement(VueHello)
customElements.define("ww-hello", WwHello)
~~~

The build compiles the .vue file, including its native slot, then bundles Vue for browser use.
