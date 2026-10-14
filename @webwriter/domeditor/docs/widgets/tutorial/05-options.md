# 5. Expose options and actions

<!-- library:vanilla -->
Add these declarations to the widget class:

```js
static options = {
  answer: {
    type: "select",
    label: {_: "Correct answer"},
    options: [
      {value: "true", label: {_: "True"}},
      {value: "false", label: {_: "False"}},
    ],
  },
}

static actions = {resetAnswer: {label: {_: "Reset correct answer"}}}

resetAnswer() { this.setAttribute("answer", "false") }
```

Select the widget in WebWriter. The **Widget** drawer now offers a **Correct answer** field and a **Reset correct answer** action. The field writes the `answer` attribute; the getter from the previous step supplies its displayed value.

Change the correct answer, then try undo and redo. The action is also one undo step. The standalone preview shows the widget; the drawer is provided by WebWriter.
<!-- /library -->

<!-- library:lit -->
Add these declarations to the widget class:

```js
static options = {
  answer: {
    type: "select",
    label: {_: "Correct answer"},
    options: [
      {value: "true", label: {_: "True"}},
      {value: "false", label: {_: "False"}},
    ],
  },
}

static actions = {resetAnswer: {label: {_: "Reset correct answer"}}}

resetAnswer() { this.setAttribute("answer", "false") }
```

Select the widget in WebWriter. The **Widget** drawer now offers a **Correct answer** field and a **Reset correct answer** action. The field writes the `answer` attribute; the getter from the previous step supplies its displayed value.

Change the correct answer, then try undo and redo. The action is also one undo step. The standalone preview shows the widget; the drawer is provided by WebWriter.
<!-- /library -->

<!-- library:react -->
<!-- include:../examples/react/05-options.md -->

Select the widget in WebWriter. The **Widget** drawer now offers a **Correct answer** field and a **Reset correct answer** action. Change the setting and try undo and redo. The standalone preview renders the widget; WebWriter supplies the drawer.

After editing the source, run `npm run build` before refreshing your local package. The embedded preview builds its imports automatically.
<!-- /library -->

<!-- library:vue -->
<!-- include:../examples/vue/05-options.md -->

Select the widget in WebWriter. The **Widget** drawer now offers a **Correct answer** field and a **Reset correct answer** action. Change the setting and try undo and redo. The standalone preview renders the widget; WebWriter supplies the drawer.

Replace `ww-quiz.vue` with this step’s complete component and `ww-quiz.js` with its registration module. Keep the component import in the registration module set to `./ww-quiz.vue`. After editing either file, run `npm run build` before refreshing your local package. The embedded preview compiles them automatically.
<!-- /library -->

<!-- library:angular -->
<!-- include:../examples/angular/05-options.md -->

Select the widget in WebWriter. The **Widget** drawer now offers a **Correct answer** field and a **Reset correct answer** action. Change the setting and try undo and redo. The standalone preview renders the widget; WebWriter supplies the drawer.

After editing your source, run `npm run build` before refreshing the local package. The embedded preview compiles it automatically.
<!-- /library -->

<!-- library:svelte -->
<!-- include:../examples/svelte/05-options.md -->

Select the widget in WebWriter. The **Widget** drawer now offers a **Correct answer** field and a **Reset correct answer** action. Change the setting and try undo and redo. The standalone preview renders the widget; WebWriter supplies the drawer.

After editing your source, run `npm run build` before refreshing the local package. The embedded preview compiles it automatically.
<!-- /library -->

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/05-options.js -->

<!-- library:vue -->
**Registration module**

<!-- script:../examples/vue/05-options.js -->
<!-- /library -->

</details>

[Open preview](../examples/preview.html?step=5)

<iframe title="Step 5: configurable quiz" src="../examples/preview.html?step=5" width="100%" height="210" loading="lazy"></iframe>

Next: [support collaboration](06-collaboration.md).
