The Vue quick start uses a [single-file component](https://vuejs.org/guide/scaling-up/sfc.html). The native slot displays the widget's child content in the shadow root. The child content stays in the light DOM.

Add Vue to the widget package.

~~~json
{
  "dependencies": {
    "vue": "^3.5.44"
  }
}
~~~

Save the template as `hello.vue`.

~~~vue
<template>
  <p>Hello, <slot>world</slot>!</p>
</template>
~~~

The registration module makes the component a [custom element](https://vuejs.org/guide/extras/web-components.html#building-custom-elements-with-vue).

~~~js
import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import VueHello from "./hello.vue"

const WwHello = defineCustomElement(VueHello)
customElements.define("ww-hello", WwHello)
~~~

The build compiles the `.vue` file with its native slot. It bundles Vue for the browser.
