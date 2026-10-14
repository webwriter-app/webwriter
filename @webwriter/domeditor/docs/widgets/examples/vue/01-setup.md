A Vue single-file component keeps its setup logic, template, and styles together. This first step needs only a template:

~~~vue
<template>
  <p>Quiz widget</p>
</template>
~~~

The registration module imports the component and registers it as ww-quiz:

~~~js
import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import VueQuiz from "./01-setup.vue"

customElements.define("ww-quiz", defineCustomElement(VueQuiz))
~~~
