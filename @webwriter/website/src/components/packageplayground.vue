<template>
  <main>
    <header>
      <h1><span>{{prettyName ?? "Unnamed"}}</span></h1>
      <select id="member-choice" v-model="activeMember">
        <option v-for="(member, key) in members" :value=key>{{member.label}}</option>
      </select>
      <span id="subheading">
        <a id="name" :href=homepage>{{name ?? "unnamed"}}</a>
        <span id="version">{{version}}</span> 
        <span id="people">
          <a v-if="people?.length! > 0" v-for="(person, i) in people" class="person" :href="(person as any).email? 'mailto:' + (person as any).email: undefined" :title="i === 0? getLabel('author'): getLabel('contributor')">{{(person as any).name}}</a>
        </span>
        <p>{{pkgDescription}}</p>
      </span>
      <div id="actions">
        <a id="close" :title="getLabel('back')" href="/packages">
          <Icon :name=X_LG></Icon>
        </a>
        <button id="contenteditable" :title="getLabel('editingMode')" @click="toggleContentEditable">
          <Icon :name=PENCIL></Icon>
        </button>
      </div>
      <div id="tag-area">
        <span id="official" v-if="name?.startsWith('@webwriter/')" :title="getLabel('officialDesc')">{{getLabel("official")}}</span>
        <span v-if="pkgLangs.relevantLangs.length" :title="pkgLangs.otherLangs.map(langKw => getLabel(langKw as any)).join(', ')">
          <Icon :name=LANGUAGE style="height: 16px"></Icon>
          {{pkgLangs.relevantLangs.map(langKw => getLabel(langKw as any)).join(", ")}}
          <template v-if="pkgLangs.otherLangs.length">{{ `+${pkgLangs.otherLangs.length}` }}</template>
        </span>
        <span v-for="kw in pkgWidgetTypes">
          <Icon :name="getIcon(kw as any)" style="height: 16px"></Icon>
          {{getLabel(kw as any)}}
        </span>
        <span v-for="kw in pkgLevels">
          <Icon :name="getIcon(kw as any)" style="height: 16px"></Icon>
          {{getLabel(kw as any)}}
        </span>
        <span v-for="kw in pkgFields">
          <Icon :name="getIcon(kw as any)" style="height: 16px"></Icon>
          {{getLabel(kw as any)}}
        </span>
        <span v-if="pkgOnlineStatus">
          <Icon :name="getIcon(pkgOnlineStatus as any)" style="height: 16px"></Icon>
          {{getLabel(pkgOnlineStatus as any)}}
        </span>
        <span v-for="kw in pkgPlainKeywords">{{kw}}</span>
        <span class="advanced divider"></span>
        <a class="advanced" :href="SPDX_LICENSES.has(license!)? `https://spdx.org/licenses/${encodeURIComponent(license!)}`: undefined">
          <Icon :name=CARD_CHECKLIST></Icon>
          <span>{{getLabel("license")}}: {{license ?? "UNLICENSED"}}</span>
        </a>
        <a class="advanced" id="package" :href="`https://npmjs.com/package/${props.name}`">
          <Icon :name=BOX_FILL></Icon>
          <code>NPM</code>
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
  & a:not(:last-of-type)::after {
    content: ", "

  }
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
import PENCIL from "bootstrap-icons/icons/pencil.svg?raw"
import GIT from "bootstrap-icons/icons/git.svg?raw"
import GITHUB from "bootstrap-icons/icons/github.svg?raw"
import BOX_FILL from "bootstrap-icons/icons/box-fill.svg?raw"
import CARD_CHECKLIST from "bootstrap-icons/icons/card-checklist.svg?raw"
import X_LG from "bootstrap-icons/icons/x-lg.svg?raw"
import HORSE_TOY from "@tabler/icons/outline/horse-toy.svg?raw"
import BACKPACK from "@tabler/icons/outline/backpack.svg?raw"
import SCHOOL from "@tabler/icons/outline/school.svg?raw"
import BOOK_2 from "@tabler/icons/outline/book-2.svg?raw"
import CHALKBOARD from "@tabler/icons/outline/chalkboard.svg?raw"
import BRUSH from "@tabler/icons/outline/brush.svg?raw"
import NEWS from "@tabler/icons/outline/news.svg?raw"
import BRIEFCASE from "@tabler/icons/outline/briefcase.svg?raw"
import MICROSCOPE from "@tabler/icons/outline/microscope.svg?raw"
import CPU from "@tabler/icons/outline/cpu.svg?raw"
import TOOL from "@tabler/icons/outline/tool.svg?raw"
import TRACTOR from "@tabler/icons/outline/tractor.svg?raw"
import HEARTBEAT from "@tabler/icons/outline/heartbeat.svg?raw"
import BUILDING_STORE from "@tabler/icons/outline/building-store.svg?raw"
import BOOK from "@tabler/icons/outline/book.svg?raw"
import BOOKS from "@tabler/icons/outline/books.svg?raw"
import ALERT_SQUARE from "@tabler/icons/outline/alert-square.svg?raw"
import HELP_SQUARE from "@tabler/icons/outline/help-square.svg?raw"
import SQUARE_CHEVRON_RIGHT from "@tabler/icons/outline/square-chevron-right.svg?raw"
import SQUARE_DOT from "@tabler/icons/outline/square-dot.svg?raw"
import INFO_SQUARE from "@tabler/icons/outline/info-square.svg?raw"
import SQUARE_ASTERISK from "@tabler/icons/outline/square-asterisk.svg?raw"
import LANGUAGE from "@tabler/icons/outline/language.svg?raw"
import WIFI from "@tabler/icons/outline/wifi.svg?raw"

import {z} from "zod"

function unionOfLiterals<T extends string | number> ( constants: readonly T[] ) {
    const literals = constants.map(
        x => z.literal( x )
    ) as unknown as readonly [ z.ZodLiteral<T>, z.ZodLiteral<T>, ...z.ZodLiteral<T>[] ]
    return z.union( literals )
  }
  

const broadFields = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "99"] as const
const narrowFields = [
  "000", "001", "002", "003", "009", "011", "018", "020", "021", "022", "023", "028", "029", "030", "031", "032", "038", "039", "040", "041", "042", "048", "049", "050", "051", "052", "053", "054", "058", "059", "061", "068", "070", "071", "072", "073", "078", "079", "080", "081", "082", "083", "084", "088", "089", "090", "091", "092", "098", "099", "100", "101", "102", "103", "104", "108", "109", "999"
] as const
const detailedFields = [
  "0000", "0011", "0021", "0031", "0099",
  "0110", "0111", "0112", "0113", "0114", "0119", "0188",
  "0200", "0210", "0211", "0212", "0213", "0214", "0215", "0219", "0220", "0221", "0222", "0223", "0229", "0230", "0231", "0232", "0239", "0288", "0299",
  "0300", "0310", "0311", "0312", "0313", "0314", "0319", "0320", "0321", "0322", "0329", "0388", "0399",
  "0400", "0410", "0411", "0412", "0413", "0414", "0415", "0416", "0417", "0419", "0421", "0488", "0499",
  "0500", "0510", "0511", "0512", "0519", "0520", "0521", "0522", "0529", "0530", "0531", "0532", "0533", "0539", "0540", "0541", "0542", "0588", "0599",
  "0610", "0611", "0612", "0613", "0619", "0688",
  "0700", "0710", "0711", "0712", "0713", "0714", "0715", "0716", "0719", "0720", "0721", "0722", "0723", "0724", "0729", "0730", "0731", "0732", "0788", "0799",
  "0800", "0810", "0811", "0812", "0819", "0821", "0831", "0841", "0888", "0899",
  "0900", "0910", "0911", "0912", "0913", "0914", "0915", "0916", "0917", "0919", "0920", "0921", "0922", "0923", "0929", "0988", "0999",
  "1000", "1010", "1011", "1012", "1013", "1014", "1015", "1019", "1020", "1021", "1022", "1029", "1030", "1031", "1032", "1039", "1041", "1088", "1099",
  "9999"
] as const


type ISCEDF2013Code = `iscedf2013-${typeof broadFields[number] | typeof narrowFields[number] | typeof detailedFields[number]}`

interface ISCEDF2013 extends z.infer<typeof ISCEDF2013["objectSchema"]> {}
class ISCEDF2013 {

  static objectSchema = z.object({
    broad: unionOfLiterals(broadFields),
    narrow: unionOfLiterals(narrowFields).optional(),
    detailed: unionOfLiterals(detailedFields).optional()
  })

  static schema = (z
    .string()
    .startsWith("iscedf2013-")
    .min("iscedf2013-".length + 2)
    .max("iscedf2013-".length + 4)
    .transform(str => {
      const code = str.slice("iscedf2013-".length)
      return {
        broad: code.slice(0, 2),
        narrow: code.length >= 3? code.slice(0, 3): undefined,
        detailed: code.length >= 4? code.slice(0, 4): undefined,
      }
    })
    .pipe(ISCEDF2013.objectSchema))
    .or(ISCEDF2013.objectSchema)
    // .transform(x => new ISCEDF2013(x))

  constructor(input: string | z.input<typeof ISCEDF2013["objectSchema"]> | ISCEDF2013) {
    return input instanceof ISCEDF2013
      ? Object.assign(this, input)
      : ISCEDF2013.schema.parse(input)
  }

  toString() {
    return "iscedf2013-" + (this.detailed ?? this.narrow ?? this.broad)
  }
}


const levels = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const
const programmes = ["01", "02", "10", "24", "25", "34", "35", "44", "45", "54", "55", "64", "65", "66", "74", "75", "76", "84", "85", "86", "99"] as const


type ISCED2011Code = `isced2011-${typeof levels[number] | typeof programmes[number]}`

interface ISCED2011 extends z.infer<typeof ISCED2011["objectSchema"]> {}
class ISCED2011 {

  static objectSchema = z.object({
    level: unionOfLiterals(levels),
    programme: unionOfLiterals(programmes).optional()
  })

  static schema = (z
    .string()
    .startsWith("isced2011-")
    .min("isced2011-".length + 1)
    .max("isced2011-".length + 2)
    .transform(str => {
      const code = str.slice("isced2011-".length)
      return {
        level: code.at(0),
        programme: code.length == 2? code: undefined 
      }
    })
    .pipe(ISCED2011.objectSchema))
    .or(ISCED2011.objectSchema)
    // .transform(x => new ISCED2011(x))

  constructor(input: string | z.input<typeof ISCED2011["objectSchema"]> | ISCED2011) {
    return input instanceof ISCED2011
      ? Object.assign(this, input)
      : ISCED2011.schema.parse(input)
  }

  toString() {
    return "isced2011-" + (this.programme ?? this.level)
  }
}

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

const lang = document.documentElement.lang as "de" | "en"

const labels = {
  "isced2011-0": {
    "en": "Preschool",
    "de": "Vorschule"
  },
  "isced2011-1": {
    "en": "Primary school",
    "de": "Grundschule"
  },
  "isced2011-2": {
    "en": "Middle school",
    "de": "Sekundarstufe I"
  },
  "isced2011-3": {
    "en": "High school",
    "de": "Sekundarstufe II"
  },
  "isced2011-4": {
    "en": "Vocational cert.",
    "de": "Berufsbildung"
  },
  "isced2011-5": {
    "en": "Associate deg.",
    "de": "Meisterbildung"
  },
  "isced2011-6": {
    "en": "Bachelor's",
    "de": "Bachelor"
  },
  "isced2011-7": {
    "en": "Master's",
    "de": "Master"
  },
  "isced2011-8": {
    "en": "Doctorate",
    "de": "Promotion"
  },
  "isced2011-9": {
    "en": "Misc. ed.",
    "de": "Sonst. Bildung"
  },
  "isced2011-2-4": {
    "en": "Secondary ed.",
    "de": "Weiterführende Bild."
  },
  "isced2011-5-8": {
    "en": "Higher ed.",
    "de": "Höhere Bild."
  },
  "iscedf2013-01": {
    "en": "Education",
    "de": "Bildung"
  },
  "iscedf2013-02": {
    "en": "Humanities",
    "de": "Gesellschaftswiss."
  },
  "iscedf2013-03": {
    "en": "Social sciences",
    "de": "Sozialwiss."
  },
  "iscedf2013-04": {
    "en": "Business",
    "de": "Wirtschaftswiss."
  },
  "iscedf2013-05": {
    "en": "Natural sciences",
    "de": "Naturwiss."
  },
  "iscedf2013-06": {
    "en": "ICT",
    "de": "Informationstech."
  },
  "iscedf2013-07": {
    "en": "Engineering",
    "de": "Ingenieurswiss."
  },
  "iscedf2013-08": {
    "en": "Food production",
    "de": "Lebensmittelprod."
  },
  "iscedf2013-09": {
    "en": "Health",
    "de": "Gesundheit"
  },
  "iscedf2013-10": {
    "en": "Services",
    "de": "Dienstleist."
  },
  "iscedf2013-99": {
    "en": "Other fields",
    "de": "Andere Felder"
  },
  "iscedf2013-all": {
    "en": "All fields",
    "de": "Alle Felder"
  },
  "widget-presentational": {
    "en": "Presentation",
    "de": "Präsentation"
  },
  "widget-practical": {
    "en": "Practice",
    "de": "Übung"
  },
  "widget-simulational": {
    "en": "Simulation",
    "de": "Simulation"
  },
  "widget-conceptual": {
    "en": "Concept",
    "de": "Konzept"
  },
  "widget-informational": {
    "en": "Information",
    "de": "Information",
  },
  "widget-contextual": {
    "en": "Context",
    "de": "Kontext"
  },
  "widget-lang-": {
    "en": "Language",
    "de": "Sprache"
  },
  "widget-online": {
    "en": "Online only",
    "de": "Nur online"
  },
  "widget-online-edit": {
    "en": "Online when editing",
    "de": "Online beim bearb."
  },
  "widget-online-use": {
    "en": "Online when using",
    "de": "Online beim benutz."
  },
  "widget-lang-ar": {
    "en": "Arabic",
    "de": "Arabisch"
  },
  "widget-lang-bg": {
    "en": "Bulgarian",
    "de": "Bulgarisch"
  },
  "widget-lang-cs": {
    "en": "Czech",
    "de": "Tschechisch"
  },
  "widget-lang-da": {
    "en": "Danish",
    "de": "Dänisch"
  },
  "widget-lang-de": {
    "en": "German",
    "de": "Deutsch"
  },
  "widget-lang-el": {
    "en": "Greek",
    "de": "Griechisch"
  },
  "widget-lang-en": {
    "en": "English",
    "de": "Englisch"
  },
  "widget-lang-es": {
    "en": "Spanish",
    "de": "Spanisch"
  },
  "widget-lang-et": {
    "en": "Estonian",
    "de": "Estnisch"
  },
  "widget-lang-fi": {
    "en": "Finnish",
    "de": "Finnisch"
  },
  "widget-lang-fr": {
    "en": "French",
    "de": "Französisch"
  },
  "widget-lang-hu": {
    "en": "Hungarian",
    "de": "Ungarisch"
  },
  "widget-lang-id": {
    "en": "Indonesian",
    "de": "Indonesisch"
  },
  "widget-lang-it": {
    "en": "Italian",
    "de": "Italienisch"
  },
  "widget-lang-ja": {
    "en": "Japanese",
    "de": "Japanisch"
  },
  "widget-lang-ko": {
    "en": "Korean",
    "de": "Koreanisch"
  },
  "widget-lang-lt": {
    "en": "Lithuanian",
    "de": "Litauisch"
  },
  "widget-lang-lv": {
    "en": "Latvian",
    "de": "Lettisch"
  },
  "widget-lang-nb": {
    "en": "Norwegian Bokmål",
    "de": "Norwegisches Bokmål"
  },
  "widget-lang-nl": {
    "en": "Dutch",
    "de": "Niederländisch"
  },
  "widget-lang-pl": {
    "en": "Polish",
    "de": "Polnisch"
  },
  "widget-lang-pt": {
    "en": "Portuguese",
    "de": "Portugiesisch"
  },
  "widget-lang-ro": {
    "en": "Romanian",
    "de": "Rumänisch"
  },
  "widget-lang-ru": {
    "en": "Russian",
    "de": "Russisch"
  },
  "widget-lang-sk": {
    "en": "Slovak",
    "de": "Slowakisch"
  },
  "widget-lang-sl": {
    "en": "Slovenian",
    "de": "Slowenisch"
  },
  "widget-lang-sv": {
    "en": "Swedish",
    "de": "Schwedisch"
  },
  "widget-lang-tr": {
    "en": "Turkish",
    "de": "Türkisch"
  },
  "widget-lang-uk": {
    "en": "Ukrainian",
    "de": "Ukrainisch"
  },
  "widget-lang-om": {
    "en": "Oromo",
    "de": "Oromo"
  },
  "widget-lang-ab": {
    "en": "Abkhazian",
    "de": "Abchasisch"
  },
  "widget-lang-aa": {
    "en": "Afar",
    "de": "Afar"
  },
  "widget-lang-af": {
    "en": "Afrikaans",
    "de": "Afrikaans"
  },
  "widget-lang-sq": {
    "en": "Albanian",
    "de": "Albanisch"
  },
  "widget-lang-am": {
    "en": "Amharic",
    "de": "Amharisch"
  },
  "widget-lang-hy": {
    "en": "Armenian",
    "de": "Armenisch"
  },
  "widget-lang-as": {
    "en": "Assamese",
    "de": "Assamesisch"
  },
  "widget-lang-ay": {
    "en": "Aymara",
    "de": "Aymara"
  },
  "widget-lang-az": {
    "en": "Azerbaijani",
    "de": "Aserbaidschanisch"
  },
  "widget-lang-ba": {
    "en": "Bashkir",
    "de": "Baschkirisch"
  },
  "widget-lang-eu": {
    "en": "Basque",
    "de": "Baskisch"
  },
  "widget-lang-bn": {
    "en": "Bengali",
    "de": "Bengalisch"
  },
  "widget-lang-dz": {
    "en": "Bhutani",
    "de": "Dzongkha"
  },
  "widget-lang-bh": {
    "en": "Bihari",
    "de": "Bihari"
  },
  "widget-lang-bi": {
    "en": "Bislama",
    "de": "Bislama"
  },
  "widget-lang-br": {
    "en": "Breton",
    "de": "Bretonisch"
  },
  "widget-lang-my": {
    "en": "Burmese",
    "de": "Burmesisch"
  },
  "widget-lang-be": {
    "en": "Byelorussian",
    "de": "Weißrussisch"
  },
  "widget-lang-km": {
    "en": "Cambodian",
    "de": "Kambodschanisch"
  },
  "widget-lang-ca": {
    "en": "Catalan",
    "de": "Katalanisch"
  },
  "widget-lang-zh": {
    "en": "Chinese",
    "de": "Chinesisch"
  },
  "widget-lang-co": {
    "en": "Corsican",
    "de": "Korsisch"
  },
  "widget-lang-hr": {
    "en": "Croatian",
    "de": "Kroatisch"
  },
  "widget-lang-eo": {
    "en": "Esperanto",
    "de": "Esperanto"
  },
  "widget-lang-fo": {
    "en": "Faeroese",
    "de": "Färöisch"
  },
  "widget-lang-fj": {
    "en": "Fiji",
    "de": "Fiji"
  },
  "widget-lang-fy": {
    "en": "Frisian",
    "de": "Friesisch"
  },
  "widget-lang-gl": {
    "en": "Galician",
    "de": "Galizisch"
  },
  "widget-lang-ka": {
    "en": "Georgian",
    "de": "Georgisch"
  },
  "widget-lang-kl": {
    "en": "Greenlandic",
    "de": "Grönländisch"
  },
  "widget-lang-gn": {
    "en": "Guarani",
    "de": "Guaraní"
  },
  "widget-lang-gu": {
    "en": "Gujarati",
    "de": "Gujarati"
  },
  "widget-lang-ha": {
    "en": "Hausa",
    "de": "Hausa"
  },
  "widget-lang-he": {
    "en": "Hebrew",
    "de": "Hebräisch"
  },
  "widget-lang-hi": {
    "en": "Hindi",
    "de": "Hindi"
  },
  "widget-lang-is": {
    "en": "Icelandic",
    "de": "Isländisch"
  },
  "widget-lang-ia": {
    "en": "Interlingua",
    "de": "Interlingua"
  },
  "widget-lang-ie": {
    "en": "Interlingue",
    "de": "Interlingue"
  },
  "widget-lang-ik": {
    "en": "Inupiak",
    "de": "Inupiak"
  },
  "widget-lang-iu": {
    "en": "Inuktitut",
    "de": "Inuktitut"
  },
  "widget-lang-ga": {
    "en": "Irish",
    "de": "Irisch"
  },
  "widget-lang-jv": {
    "en": "Javanese",
    "de": "Javanisch"
  },
  "widget-lang-kn": {
    "en": "Kannada",
    "de": "Kannada"
  },
  "widget-lang-ks": {
    "en": "Kashmiri",
    "de": "Kashmiri"
  },
  "widget-lang-kk": {
    "en": "Kazakh",
    "de": "Kasachisch"
  },
  "widget-lang-rw": {
    "en": "Kinyarwanda",
    "de": "Kinyarwanda"
  },
  "widget-lang-ky": {
    "en": "Kirghiz",
    "de": "Kirgiesisch"
  },
  "widget-lang-rn": {
    "en": "Kirundi",
    "de": "Kirundi"
  },
  "widget-lang-ku": {
    "en": "Kurdish",
    "de": "Kurdisch"
  },
  "widget-lang-lo": {
    "en": "Laothian",
    "de": "Laotisch"
  },
  "widget-lang-la": {
    "en": "Latin",
    "de": "Latein"
  },
  "widget-lang-ln": {
    "en": "Lingala",
    "de": "Lingala"
  },
  "widget-lang-mk": {
    "en": "Macedonian",
    "de": "Makedonisch"
  },
  "widget-lang-mg": {
    "en": "Malagasy",
    "de": "Malagasy"
  },
  "widget-lang-ms": {
    "en": "Malay",
    "de": "Malayisch"
  },
  "widget-lang-ml": {
    "en": "Malayalam",
    "de": "Malayalam"
  },
  "widget-lang-mt": {
    "en": "Maltese",
    "de": "Maltesisch"
  },
  "widget-lang-mi": {
    "en": "Maori",
    "de": "Māori"
  },
  "widget-lang-mr": {
    "en": "Marathi",
    "de": "Marathi"
  },
  "widget-lang-mn": {
    "en": "Mongolian",
    "de": "Mongolisch"
  },
  "widget-lang-na": {
    "en": "Nauru",
    "de": "Nauruisch"
  },
  "widget-lang-ne": {
    "en": "Nepali",
    "de": "Nepalesisch"
  },
  "widget-lang-no": {
    "en": "Norwegian",
    "de": "Norwegisch"
  },
  "widget-lang-oc": {
    "en": "Occitan",
    "de": "Okzitanisch"
  },
  "widget-lang-or": {
    "en": "Oriya",
    "de": "Oriya"
  },
  "widget-lang-ps": {
    "en": "Pashto",
    "de": "Paschtu"
  },
  "widget-lang-fa": {
    "en": "Persian",
    "de": "Persisch"
  },
  "widget-lang-pa": {
    "en": "Punjabi",
    "de": "Panjabi"
  },
  "widget-lang-qu": {
    "en": "Quechua",
    "de": "Quechua"
  },
  "widget-lang-rm": {
    "en": "Rhaeto-Romanian",
    "de": "Rätoromanisch"
  },
  "widget-lang-sm": {
    "en": "Samoan",
    "de": "Samoanisch"
  },
  "widget-lang-sg": {
    "en": "Sango",
    "de": "Sango"
  },
  "widget-lang-sa": {
    "en": "Sanskrit",
    "de": "Sanskrit"
  },
  "widget-lang-gd": {
    "en": "Scots Gaelic",
    "de": "Schottisch-Gälisch"
  },
  "widget-lang-sr": {
    "en": "Serbian",
    "de": "Serbisch"
  },
  "widget-lang-sh": {
    "en": "Serbo-Croatian",
    "de": "Serbokroatisch"
  },
  "widget-lang-st": {
    "en": "Sesotho",
    "de": "Sesotho"
  },
  "widget-lang-tn": {
    "en": "Setswana",
    "de": "Setswana"
  },
  "widget-lang-sn": {
    "en": "Shona",
    "de": "Shona"
  },
  "widget-lang-sd": {
    "en": "Sindhi",
    "de": "Sindhi"
  },
  "widget-lang-si": {
    "en": "Singhalese",
    "de": "Singhalese"
  },
  "widget-lang-ss": {
    "en": "Siswati",
    "de": "Siswati"
  },
  "widget-lang-so": {
    "en": "Somali",
    "de": "Somali"
  },
  "widget-lang-sw": {
    "en": "Swahili",
    "de": "Swahili"
  },
  "widget-lang-tl": {
    "en": "Tagalog",
    "de": "Tagalog"
  },
  "widget-lang-tg": {
    "en": "Tajik",
    "de": "Tadschikisch"
  },
  "widget-lang-ta": {
    "en": "Tamil",
    "de": "Tamilisch"
  },
  "widget-lang-tt": {
    "en": "Tatar",
    "de": "Tatarisch"
  },
  "widget-lang-te": {
    "en": "Telugu",
    "de": "Telugu"
  },
  "widget-lang-th": {
    "en": "Thai",
    "de": "Thai"
  },
  "widget-lang-bo": {
    "en": "Tibetan",
    "de": "Tibetanisch"
  },
  "widget-lang-ti": {
    "en": "Tigrinya",
    "de": "Tigrinya"
  },
  "widget-lang-to": {
    "en": "Tonga",
    "de": "Tongaisch"
  },
  "widget-lang-ts": {
    "en": "Tsonga",
    "de": "Xitsonga"
  },
  "widget-lang-tk": {
    "en": "Turkmen",
    "de": "Turkmenisch"
  },
  "widget-lang-tw": {
    "en": "Twi",
    "de": "Akan"
  },
  "widget-lang-ug": {
    "en": "Uigur",
    "de": "Uigurisch"
  },
  "widget-lang-ur": {
    "en": "Urdu",
    "de": "Urdu"
  },
  "widget-lang-uz": {
    "en": "Uzbek",
    "de": "Usbekisch"
  },
  "widget-lang-vi": {
    "en": "Vietnamese",
    "de": "Vietnamesisch"
  },
  "widget-lang-vo": {
    "en": "Volapuk",
    "de": "Volapük"
  },
  "widget-lang-wa": {
    "en": "Welch",
    "de": "Walisisch"
  },
  "widget-lang-wo": {
    "en": "Wolof",
    "de": "Wolof"
  },
  "widget-lang-xh": {
    "en": "Xhosa",
    "de": "isiXhosa"
  },
  "widget-lang-yi": {
    "en": "Yiddish",
    "de": "Jiddisch"
  },
  "widget-lang-yo": {
    "en": "Yoruba",
    "de": "Yoruba"
  },
  "widget-lang-za": {
    "en": "Zhuang",
    "de": "Zhuang"
  },
  "widget-lang-zu": {
    "en": "Zulu",
    "de": "Zulu"
  },
  "license": {
    "en": "License",
    "de": "Lizenz"
  },
  "official": {
    "en": "Official",
    "de": "Offiziell"
  },
  "author": {
    "en": "Original author of the package",
    "de": "Original-Autor des Packages",
  },
  "contributor": {
    "en": "Contributor to of the package",
    "de": "Mitwirkend am Package",
  },
  "back": {
    "en": "Back to package gallery",
    "de": "Zurück zur Package-Gallerie",
  },
  "editingMode": {
    "en": "Toggle editing mode",
    "de": "Bearbeitungs-Modus umschalten"
  },
  "officialDesc": {
    "en": "This package is published by the WebWriter team",
    "de": "Dieses Package wird vom WebWriter-Team veröffentlicht"
  }
} as const

function getLabel(key: keyof typeof labels) {
  return labels?.[key]?.[lang] ?? key
}

const icons = {
  "isced2011-0": HORSE_TOY,
  "isced2011-1": BACKPACK,
  "isced2011-2": BACKPACK,
  "isced2011-3": BACKPACK,
  "isced2011-4": BACKPACK,
  "isced2011-5": SCHOOL,
  "isced2011-6": SCHOOL,
  "isced2011-7": SCHOOL,
  "isced2011-8": SCHOOL,
  "isced2011-9": BOOK_2,
  "isced2011-2-4": BACKPACK,
  "isced2011-5-8": SCHOOL,
  "iscedf2013-01": CHALKBOARD,
  "iscedf2013-02": BRUSH,
  "iscedf2013-03": NEWS,
  "iscedf2013-04": BRIEFCASE,
  "iscedf2013-05": MICROSCOPE,
  "iscedf2013-06": CPU,
  "iscedf2013-07": TOOL,
  "iscedf2013-08": TRACTOR,
  "iscedf2013-09": HEARTBEAT,
  "iscedf2013-10": BUILDING_STORE,
  "iscedf2013-99": BOOK,
  "iscedf2013-all": BOOKS,
  "widget-presentational": ALERT_SQUARE,
  "widget-practical": HELP_SQUARE,
  "widget-simulational": SQUARE_CHEVRON_RIGHT,
  "widget-conceptual": SQUARE_DOT,
  "widget-informational": INFO_SQUARE,
  "widget-contextual": SQUARE_ASTERISK,
  "widget-lang-": LANGUAGE,
  "widget-online": WIFI,
  "widget-online-edit": WIFI,
  "widget-online-use": WIFI,
} as const

function getIcon(key: keyof typeof icons) {
  return icons[key]
}

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

const pkgLevels = computed(() => {
  const allProgrammes = (props.keywords as string[])?.filter(kw => kw.startsWith("isced2011-")).map(kw => new ISCED2011(kw)).sort()
  const secondaryLevel = ["2", "3", "4"].every(k => allProgrammes.some(pg => pg.level === k))
  const tertiaryLevel = ["5", "6", "7", "8"].every(k => allProgrammes.some(pg => pg.level === k))
  return [
    allProgrammes.find(pg => pg.level === "0")?.level,
    allProgrammes.find(pg => pg.level === "1")?.level,
    ...(secondaryLevel? ["2-4"]: [
      allProgrammes.find(pg => pg.level === "2")?.level,
      allProgrammes.find(pg => pg.level === "3")?.level,
      allProgrammes.find(pg => pg.level === "4")?.level
    ]),
    ...(tertiaryLevel? ["5-8"]: [
      allProgrammes.find(pg => pg.level === "5")?.level,
      allProgrammes.find(pg => pg.level === "6")?.level,
      allProgrammes.find(pg => pg.level === "7")?.level,
      allProgrammes.find(pg => pg.level === "8")?.level,
    ]),
  ].filter(level => level).map(level => `isced2011-${level}`)
})

const pkgFields = computed(() => {
  const broadFieldCodes = (props.keywords as string[])?.filter(kw => kw.startsWith("iscedf2013-")).map(kw => new ISCEDF2013(kw).broad)
  const includesAllFields = (["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"] as const).every(code => broadFieldCodes.includes(code))
  const codes = includesAllFields? ["all"] as const: broadFieldCodes
  return codes.map(code => `iscedf2013-${code}`)
})

const pkgOnlineStatus = computed(() => {
  const onlineCodes = (props.keywords as string[])?.filter(kw => kw.startsWith("widget-online"))
  if(onlineCodes.includes("widget-online")) {
    return "widget-online"
  }
  else if(onlineCodes.includes("widget-online-edit")) {
    return "widget-online-edit"
  }
  else if(onlineCodes.includes("widget-online-use")) {
    return "widget-online-use"
  }
  else {
    return undefined
  }
})

const pkgLangs = computed(() => {
  const langs = (props.keywords as string[])?.filter(kw => kw.startsWith("widget-lang-"))
  const userLangs = [...new Set(navigator.languages.map(l => l.split("-").at(0))), lang]
  const relevantLangs = langs.filter(lang => userLangs.includes(lang.slice("widget-lang-".length)))
  const otherLangs = langs.filter(lang => !userLangs.includes(lang.slice("widget-lang-".length)))
  return {relevantLangs, otherLangs}
})

const pkgWidgetTypes = computed(() => {
  const types = ["widget-presentational", "widget-practical", "widget-simulational", "widget-conceptual", "widget-informational", "widget-contextual"]
  return (props.keywords as string[])?.filter(kw => types.includes(kw))
})

const pkgPlainKeywords = computed(() => {
  return (props.keywords as string[])?.filter(kw => !kw.startsWith("iscedf2013-") && !kw.startsWith("isced2011-") && !kw.startsWith("widget-") && !(kw === "webwriter-widget"))
})

const pkgDescription = computed(() => {
  return props.editingConfig?.["."]?.description?.[lang] ?? props.description
})

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

