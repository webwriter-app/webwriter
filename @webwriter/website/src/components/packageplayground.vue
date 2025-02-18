<template>
  <main>
    <header>
      <h1><span>{{prettyName ?? "Unnamed"}}</span></h1>
      <select id="member-choice" v-model="activeMember">
        <option v-for="(member, key) in members" v-bind:value=key>{{member.label}}</option>
      </select>
      <span id="subheading">
        <a id="name" title="Technical name of the widget" v-bind:href=homepage>{{name ?? "unnamed"}}</a>
        <span id="version" title="Version of the widget">{{version}}</span> 
        <span id="people" title="Author and contributors">
          <a v-if="people?.length! > 0" v-for="(person, i) in people" class="person" v-bind:href="(person as any).email? 'mailto:' + (person as any).email: undefined" v-bind:title="i === 0? 'Author of the widget': 'Contributor to the widget'">{{(person as any).name}}</a>
        </span>
        <p>{{description}}</p>
      </span>
      <div id="actions">
        <a id="close" title="Back to widget gallery" href="/packages">
          <Icon v-bind:name=X_LG></Icon>
        </a>
        <button id="contenteditable" title="Toggle editing mode" @click="toggleContentEditable">
          <Icon v-bind:name=PENCIL></Icon>
        </button>
      </div>
      <div id="tag-area">
        <span id="official" v-if="name?.startsWith('@webwriter/')" title="This package is published by the WebWriter team">Official</span>
        <span v-for="kw in keywords">{{kw}}</span>
        <span class="advanced divider"></span>
        <a class="advanced" title="License chosen by the author" v-bind:href="SPDX_LICENSES.has(license!)? `https://spdx.org/licenses/${encodeURIComponent(license!)}`: undefined">
          <Icon v-bind:name=CARD_CHECKLIST></Icon>
          <span>License: {{license ?? "UNLICENSED"}}</span>
        </a>
        <a class="advanced" title="Package on NPM" id="package" v-bind:href="`https://npmjs.com/package/${props.name}`">
          <Icon v-bind:name=BOX_FILL></Icon>
          <code>Package</code>
        </a>
      </div>
    </header>
    <section id="preview" v-if="members[activeMember].type === 'widget'" v-html='`<${members[activeMember].tag}></${members[activeMember].tag}>`'>
    </section>
    <section id="preview" v-else v-html="members[activeMember].content">
    </section>
    <!--
    <div id="toggles">
      <div class="sideline"></div>
      <input id="toggle-sidebar-layout" checked type="checkbox" @change=${toggleSidebar}>
      <label title="Toggle sidebar layout" class="editor-toggle" for="toggle-sidebar-layout">
        <span class="for-active">${ICON(LAYOUT_SIDEBAR_INSET_REVERSE)}</span>
        <span class="for-inactive">${ICON(SQUARE)}</span>
      </label>
      <input id="toggle-contentEditable" type="checkbox" @change=${toggleContentEditable}>
      <label title="Toggle editing view" class="editor-toggle for-active" for="toggle-contentEditable">
        <span class="for-active">${ICON(PENCIL_FILL)}</span>
        <span class="for-inactive">${ICON(PENCIL)}</span>
      </label>
      <input id="toggle-printable" type="checkbox" @change=${togglePrintable}>
      <label title="Toggle printing view" class="editor-toggle" for="toggle-printable">
        <span class="for-active">${ICON(PRINTER_FILL)}</span>
        <span class="for-inactive">${ICON(PRINTER)}</span>
      </label>
      <div class="sideline"></div>
    </div>
    <main id="preview">
    </main>
    <div id="editor">
      <nav>
        <button class="tab" data-target="#markup" @click=${(e: any) => activeTab = e.target.getAttribute("data-target")} ?data-active=${activeTab === "#markup"}>Live Code</button>
      </nav>
      <div id="editor-tabs">
        <div class="tab-panel" id="markup" ?data-active=${activeTab === "#markup"}></div>
      </div>
    </div>
    -->
  </main>
</template>

<style scoped>
main {
  display: grid;
  grid-template-columns: 3fr minmax(min-content, 1fr);
  grid-template-rows: min-content 1fr min-content;
  gap: 1rem;
  padding: 0 2rem;
  padding-bottom: 1rem;
  box-sizing: border-box;
  min-height: 800px;
}

header {
  grid-column: 1 / 3;
  grid-row: 1;
  display: grid;
  grid-template-columns: max-content 1fr min-content;
  grid-template-rows: min-content min-content;
  gap: 0.25rem 1rem;
}

#toggles {
  grid-row: 3;
  grid-column: 1 / 3;
}

header h1, header h2, header p {
  margin: 0;
}

header h1 {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  background: var(--sl-color-gray-950);
  color: var(--sl-color-gray-50);
  padding: 0.5rem 2rem;
  grid-column: 1;
  grid-row: 1 / 2;
}

header #member-choice {
  grid-row: 2;
  background: var(--sl-color-gray-950);
  color: var(--sl-color-gray-50);
  padding-right: 0.5ch;
  border: 5px solid var(--sl-color-gray-950);
  border-radius: 0;
}

header #name {
  font-size: 1rem;
  font-weight: bold;
  font-family: var(--sl-font-mono);
  color: var(--sl-color-gray-800);
  text-decoration: underline;
}

header #version {
  font-family: var(--sl-font-mono);
}

header p {
  justify-self: start;
  grid-row: 2;
}

header #actions {
  grid-row: 1 / 3;
  grid-column: 3;
  display: flex;
  flex-direction: column;
  gap: 1ch;
}

#contenteditable {
  cursor: pointer;
}

main:has(#preview [contenteditable]) #contenteditable {
  background: var(--sl-color-primary-200);
}

header #actions > * {
  padding: 0.4rem 0.5rem;
  width: 35px;
  height: 35px;
  box-sizing: border-box;
  border: 2px solid var(--sl-color-gray-800);
  display: flex;
  align-items: center;
}


header #tag-area {
  grid-row: 2;
  grid-column: 2 / 3;

}

#preview {
  min-width: min(100%, 300px);
  max-width: 800px;
  grid-column: 1 / 3;
  grid-row: 2;
  width: 100%;
  height: 100%;
  border: none;
  display: flex;
  margin: 0 auto;
}

#preview > * {
  width: 100%;
}

.tab-panel {
  background: white;
  border: 2px solid var(--sl-color-gray-800);
  border-radius: 0 0 10px 10px;
}

:host(:not([contenteditable])) #editor {
  display: none;
}

:host(:not([contenteditable])) #preview {
  grid-column: 1 / 3;
}

#subheading {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0 2ch;
}

#subheading p {
  margin-top: 0.5ch;
  width: 100%;
}

#people {
  font-style: italic;
  font-size: 0.9rem;
}

.person {
  text-decoration: none;
  color: inherit;
}

.person:hover {
  text-decoration: underline;
}

#tag-area {
  font-size: 0.8rem;
  padding-top: 0.2rem;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 1ch;
}

#tag-area > *:not(.divider) {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 1ch;
  background: white;
  padding: 0.1rem 0.25rem;
  border: 1px solid var(--sl-color-gray-950);
  text-decoration: none;
  color: inherit;
  border-radius: 2px;
}

#tag-area > a[href]:hover {
  text-decoration: underline;
}

#official {
  border-width: 2px !important;
  font-weight: bold;
}

.divider {
  border: 1px solid var(--sl-color-gray-950);
}

#close, #edit {
  background: var(--sl-color-gray-100);
  cursor: pointer;
  line-height: 100%;
}

#edit[data-active] {
  background: var(--sl-color-primary-200);
}

#edit:hover {
  background: var(--sl-color-primary-200);
}

#edit:active {
  background: var(--sl-color-primary-300);
}

#close:hover {
  background: var(--sl-color-gray-200);
}

#close:active {
  background: var(--sl-color-gray-300);
}

#editor {
  position: relative;
  height: 100%;
  grid-column: 2;
  grid-row: 2;
}

.tab[data-active] {
  z-index: 10;
  font-weight: bold;
}


.tab:not([data-active]) {
  opacity: 66%;
}

.tab-panel {
  z-index: 0;
  position: relative;
  height: 100%;
}

.tab-panel:not([data-active]) {
  display: none;
}

#repository:not([href]) {
  opacity: 66%;
  cursor: not-allowed;
}

.tab {
  margin-bottom: -2px;
  position: relative;
  background: white;
  cursor: pointer;
  padding: 0.5rem 1rem;
  border: 2px solid var(--sl-color-gray-950);
  border-bottom: 0;
  border-radius: 5px 5px 0 0;
  overflow-y: scroll !important;
  box-sizing: border-box;
}

#editor * {
  box-sizing: border-box;
}

#editor-tabs {
  height: 100%;
}

#editor nav {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  gap: 0.5ch;
}

#editor nav label {
  font-size: 0.75rem;
}

#toggles input[type=checkbox] {
  display: none;
}

#toggles {
  display: flex;
  flex-direction: row;
  justify-content: center;
  gap: 1ch;
  margin-top: 1rem;
}

#toggles .icon {
  height: 20px;
  width: 20px;
}

.cm-editor {
  outline: none !important;
  overflow-x: hidden !important;
}

.cm-line {
  position: relative;
}

.cm-editor button.run {
  position: absolute;
  top: 0;
  right: 1ch;
  border: none;
  background: none;
  cursor: pointer;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: 4px;
  opacity: 50%;
}

.cm-editor button.run:hover {
  opacity: 90%;
}

.cm-editor button.run:active {
  opacity: 50%;
}

.editor-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  cursor: pointer;
  user-select: none;
  -moz-user-select: none;
}

.editor-toggle:hover {
  background: var(--sl-color-gray-200);
}

input:checked + .editor-toggle .for-inactive {
  display: none;
}

input:not(:checked) + .editor-toggle .for-active {
  display: none;
}

.sideline {
  height: 2px;
  width: 100%;
  background: var(--sl-color-gray-950);
  margin: auto 0;
}

@media (max-width: 800px) {
  header h1 {
    grid-row: 1;
    grid-column: 1 / 3;
  }

  header #subheading {
    grid-row: 2;
    grid-column: 1 / 4;
  }

  header #actions {
    grid-row: 1;
    grid-column: 3;
  }

  header #tag-area {
    grid-row: 3;
    grid-column: 1 / 4;
  }

  #editor {
    grid-column: 1 / 3;
  }
}
</style>
  
<script setup lang="ts">
import { computed, getCurrentInstance, h, onMounted, ref, watch, type Component, type PublicProps } from 'vue';
import SPDX_LICENSES from "spdx-license-list/simple"
import PENCIL_FILL from "bootstrap-icons/icons/pencil-fill.svg?raw"
import PENCIL from "bootstrap-icons/icons/pencil.svg?raw"
import SQUARE from "bootstrap-icons/icons/square.svg?raw"
import CODE_SLASH from "bootstrap-icons/icons/code-slash.svg?raw"
import GIT from "bootstrap-icons/icons/git.svg?raw"
import GITHUB from "bootstrap-icons/icons/github.svg?raw"
import BOX_FILL from "bootstrap-icons/icons/box-fill.svg?raw"
import CARD_CHECKLIST from "bootstrap-icons/icons/card-checklist.svg?raw"
import X_LG from "bootstrap-icons/icons/x-lg.svg?raw"
import DOWNLOAD from "bootstrap-icons/icons/download.svg?raw"
import ARROW_DOWN from "bootstrap-icons/icons/arrow-down.svg?raw"
import PLAY_CIRCLE_FILL from "bootstrap-icons/icons/play-circle-fill.svg?raw"
import PRINTER_FILL from "bootstrap-icons/icons/printer-fill.svg?raw"
import PRINTER from "bootstrap-icons/icons/printer.svg?raw"
import LAYOUT_SIDEBAR_INSET_REVERSE from "bootstrap-icons/icons/layout-sidebar-inset-reverse.svg?raw"

const props = defineProps({
  name: String,
  homepage: String,
  description: String,
  version: String,
  license: String,
  people: Array,
  keywords: Array,
  exports: Object,
  editingConfig: Object,
  snippets: Object
})

function prettifyPackageName(name: string) {
  let result = name.replaceAll(/^@.+\//g, "")
  result = result.split("-").map(part => part[0].toUpperCase() + part.slice(1)).join(" ")
  return result
}

const Icon: Component = props => h("img", {class: "icon", src: "data:image/svg+xml;utf8," + props.name})
const prettyName = computed(() => prettifyPackageName(props.name!))

const members = computed(() => 
  Object.fromEntries(Object.keys(props.exports!)
    .filter(k => 
      (k.startsWith("./snippets/") || k.startsWith("./widgets/"))
      && !(props.editingConfig ?? {})[k.slice(0, k.lastIndexOf("."))]?.uninsertable
    )
    .map(k => [k,
        {
          key: k,
          type: k.startsWith("./widgets/")? "widget": "snippet",
          url: `https://cdn.jsdelivr.net/npm/${props.name}@${props.version}/${props.exports![k]?.default?.slice(2) ?? props.exports![k]?.slice(2)}`,
          label: k.split("/")?.at(2)?.split(".").at(0)?.split("-").slice(k.startsWith("./widgets/")? 1: 0).map(k => k[0].toUpperCase() + k.slice(1)).join(" "),
          tag: k.startsWith("./snippets/")
            ? undefined
            : k.replace("./widgets/", "").split(".").at(0),
          hasContent: k.startsWith("./snippets/")
            ? undefined
            : (props.editingConfig ??  {})[k]?.content,
          content: k.startsWith("./widgets/")
            ? undefined
            : (props.snippets ?? {})[k],
        }
      ]
    )
  )
)

const activeMember = ref(Object.values(members.value).find(member => member.type === "snippet")?.key ?? Object.keys(members.value)[0])

watch(members, () => {
  for(const [key, value] of Object.entries(members.value).filter(([k, v]) => v.type === "widget")) {
    const scriptUrl = value.url.slice(0, -2) + ".js"
    const styleUrl = value.url.slice(0, -2) + ".css"
    if(!document.head.querySelector(`script.${value.tag}`)) {
      const script = document.createElement("script")
      script.src = scriptUrl
      script.type = "module"
      document.head.append(script)
    }
    if(!document.head.querySelector(`link.${value.tag}`)) {
      const link = document.createElement("link")
      link.href = styleUrl
      link.rel = "stylesheet"
      document.head.append(link)
    }
  }
}, {immediate: true})

function toggleContentEditable() {
  const tags = Object.values(members.value).map(member => member.tag).filter(t => t)
  tags.forEach(t => document.body.querySelector(t!)!.toggleAttribute("contenteditable"))
  getCurrentInstance()!.proxy?.$forceUpdate();
}

onMounted(() => {
  // toggleContentEditable()
})
</script>

