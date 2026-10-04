import {LitElement, PropertyDeclaration} from "lit"
import { property } from "lit/decorators.js"
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

interface BaseOptionDeclaration<TypeHint=any> extends PropertyDeclaration<TypeHint> {
  type?: TypeHint
  label?: Record<string, string>
  placeholder?: Record<string, string>
  description?: Record<string, string>
}

export interface BooleanOptionDeclaration extends BaseOptionDeclaration<BooleanConstructor | "boolean"> {}

interface InputOptionDeclaration<TypeHint=any> extends BaseOptionDeclaration<TypeHint> {
  pattern?: string
  minlength?: number
  maxlength?: number
  autocapitalize?: "none" | "characters" | "words" | "sentences"
  spellcheck?: "true" | "false"
  autocomplete?: HTMLInputElement["autocomplete"]
  inputmode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url"
}

export interface StringOptionDeclaration extends InputOptionDeclaration<StringConstructor | "string"> {
  multiline?: boolean
}

export interface NumberOptionDeclaration extends InputOptionDeclaration<NumberConstructor | "number"> {
  min?: number
  max?: number
  step?: number
}

export interface DateOptionDeclaration extends InputOptionDeclaration<"date"> {
  min?: number
  max?: number
  step?: number
}
export interface DatetimeLocalOptionDeclaration extends InputOptionDeclaration<"datetime-local"> {
  min?: number
  max?: number
  step?: number
}
export interface EmailOptionDeclaration extends InputOptionDeclaration<"email"> {}
export interface PasswordOptionDeclaration extends InputOptionDeclaration<"password"> {}
export interface TelOptionDeclaration extends InputOptionDeclaration<"tel"> {}
export interface TimeOptionDeclaration extends InputOptionDeclaration<"time"> {}
export interface UrlOptionDeclaration extends InputOptionDeclaration<"url"> {}

export interface ObjectOptionDeclaration extends BaseOptionDeclaration<ObjectConstructor | "object" | ArrayConstructor | "array"> {
  
}

export interface ColorOptionDeclaration extends BaseOptionDeclaration<"color"> {
  swatches?: string[]
}

export interface SelectOptionDeclaration extends BaseOptionDeclaration<"select"> {
  multiple?: boolean
  options?: {value: string, label?: Record<string, string>, description?: Record<string, string>}[]
}

export type OptionDeclaration = 
| BooleanOptionDeclaration
| StringOptionDeclaration
| NumberOptionDeclaration
| DateOptionDeclaration
| DatetimeLocalOptionDeclaration
| EmailOptionDeclaration
| PasswordOptionDeclaration
| TelOptionDeclaration
| TimeOptionDeclaration
| UrlOptionDeclaration
| ObjectOptionDeclaration
| ColorOptionDeclaration
| SelectOptionDeclaration

export interface ActionDeclaration {
  label?: Record<string, string>
  placeholder?: Record<string, string>
  description?: Record<string, string>
}

export function option<This extends LitElementWw, Return>(decl: OptionDeclaration = {type: "string"}) {
  return (target: ClassAccessorDecoratorTarget<This, Return>, context: ClassAccessorDecoratorContext<This, Return>) => {
    function init(this: This) {
      this.constructor["options"] = {...this.constructor["options"], [context.name]: decl}
    }
    context.addInitializer(init)
  }
}

export function action<This extends LitElementWw, Args extends any[], Return>(decl?: ActionDeclaration) {
  return (target: (this: This, ...args: Args) => Return, context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return> | ClassAccessorDecoratorContext<This, Return>) => {
    function init(this: This) {
      this.constructor["actions"] = {...this.constructor["actions"], [context.name]: decl}
    }
    context.addInitializer(init)
    function func(this: This, ...args: any[]) {
      this._inTransaction = true
      try {
        return target.apply(this, args)
      }
      finally {
        this._inTransaction = false
      }
    }
    if(context.kind === "method") {
      return func
    }
    else {
      context.access.set(this, func as any)
    }
  }
}

/** MIME type essences browsers execute as classic scripts. */
const javaScriptMimeTypes = new Set([
  "application/ecmascript", "application/javascript", "application/x-ecmascript", "application/x-javascript",
  "text/ecmascript", "text/javascript", "text/javascript1.0", "text/javascript1.1", "text/javascript1.2",
  "text/javascript1.3", "text/javascript1.4", "text/javascript1.5", "text/jscript", "text/livescript",
  "text/x-ecmascript", "text/x-javascript",
])

/** Whether a script `type` is an inert data block type, such as `application/json`. WebWriter keeps such `<script>` children of a widget as its data containers. */
export function isDataBlockType(type: string) {
  const essence = type.split(";")[0].trim().toLowerCase()
  return /^[^\s/]+\/[^\s/]+$/.test(essence) && !javaScriptMimeTypes.has(essence)
}

/** Connected widgets that follow the language of an ancestor. */
const languageFollowers = new Set<LitElementWw>()
let languageObserver: MutationObserver | undefined

function observeLanguage(widget: LitElementWw) {
  languageFollowers.add(widget)
  languageObserver ??= new MutationObserver(() => languageFollowers.forEach(follower => follower.languageChanged()))
  languageObserver.observe(widget.ownerDocument.documentElement, {attributes: true, attributeFilter: ["lang"], subtree: true})
}

function unobserveLanguage(widget: LitElementWw) {
  languageFollowers.delete(widget)
  if(!languageFollowers.size) {
    languageObserver?.disconnect()
    languageObserver = undefined
  }
}

/**Minimal base class for a WebWriter widget implemented in Lit. Implements the core properties required by WebWriter, initializes the component when loaded and provides a Scoped Custom Element Registry (@open-wc/scoped-elements) to help with namespace conflicts when using other components in this widget. */
export class LitElementWw extends ScopedElementsMixin(LitElement) {

  /** Register the classes of custom elements to use in the Shadow DOM here. DO NOT register any additional elements globally.
   * @example
   * import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js"
   * ...
   *   static scopedElements = {"sl-button": SlButton}
   **/
  protected static scopedElements = {}

  static readonly options: Record<string, OptionDeclaration> = {}
  static readonly actions: Record<string, ActionDeclaration> = {}

  static readonly dataType: string | undefined = undefined

  /** Declare attributes as options. Used by WebWriter to auto-generate input fields to modify these attributes. As the name suggests, this is mostly suited to simple attributes (boolean, string, etc.). Use a getter here (`get options() {...}`) to dynamically change options depending on the state of the widget.*/
  readonly options: Record<string, OptionDeclaration>

  /** Declare methods as actions. Used by WebWriter to treat all DOM changes triggered by the method as a single change (as a transaction).*/
  readonly actions: Record<string, ActionDeclaration> = {}

  /** Add `@lit/localize` support. This should be the return value of `configureLocalization`. */
  protected localize: {getLocale: () => string, setLocale: (locale: string) => Promise<void>}

  /** Whether the widget is being edited: the editor marks widgets with `contenteditable`, and the document is editable while authoring. In a preview or an exported document, the widget is not editable. */
  get editable() {
    return this.isContentEditable
  }

  static get observedAttributes() {
    return [...new Set([...super.observedAttributes, "contenteditable"])]
  }

  attributeChangedCallback(name: string, oldValue: string | null, value: string | null) {
    super.attributeChangedCallback(name, oldValue, value)
    if(name === "contenteditable") this.requestUpdate("editable")
  }

  #lang: string | null = null

  get lang() {
    return (this.#lang ?? (this.parentElement?.closest("[lang]") as HTMLElement)?.lang) ?? ""
  }

  /** [HTML global attribute] Language of the widget, allowing presentation changes for each language. Without its own `lang` attribute, the widget follows the nearest ancestor's, including later changes to it. Only a language set on the widget itself is written to its attribute. */
  @property({type: String, attribute: true})
  set lang(value) {
    this.#lang = value ?? null
    if(this.#lang !== null && this.getAttribute("lang") !== this.#lang) this.setAttribute("lang", this.#lang)
    else if(this.#lang === null && this.hasAttribute("lang")) this.removeAttribute("lang")
    this.#inheritedLang = this.#lang !== null ? "" : this.lang
    this.localize?.setLocale(this.lang).finally(() => this.requestUpdate())
  }

  #inheritedLang = ""

  /** @internal Called when a `lang` attribute in the document changes. The
   * update is not reflected, so the inherited language never becomes an
   * attribute of the widget. */
  languageChanged() {
    if(this.#lang !== null || this.lang === this.#inheritedLang) return
    this.#inheritedLang = this.lang
    this.localize?.setLocale(this.lang).finally(() => this.requestUpdate())
  }

  #dataContainer(): HTMLScriptElement | null {
    return Array.from(this.children).find((child): child is HTMLScriptElement => child instanceof HTMLScriptElement
      && child.hasAttribute("type") && isDataBlockType(child.type) && !child.hasAttribute("src")) ?? null
  }

  /** The text of the widget's data container: its first `<script>` child with a data block type (a non-JavaScript MIME type such as `application/json`) and no `src`. The editor keeps data containers under any content model, so state stored here is saved, copied and synchronized with the widget. */
  get data() {
    return this.#dataContainer()?.textContent ?? null
  }

  @property({attribute: false})
  set data(value) {
    this.setData(this.dataType ?? "text/plain", value ?? "")
  }

  get dataType() {
    return this.#dataContainer()?.type ?? (this.constructor as typeof LitElementWw).dataType
  }

  /** Replace the data container with a new one of the given data block type, value and optional attributes, or create it if there is none. */
  setData(type: string, value: string, attrs?: Record<string, string>) {
    if(!isDataBlockType(type)) throw new TypeError(`'${type}' is not a data block type`)
    const old = this.#dataContainer()
    const current = old? old.cloneNode(true) as HTMLScriptElement: document.createElement("script")
    current.textContent = value
    current.type = type
    Object.keys(attrs ?? {}).forEach(k => current.setAttribute(k, attrs[k]))
    old? old.replaceWith(current): this.append(current)
    this.requestUpdate("data")
  }

  /** @internal */
  _inTransaction = false

  connectedCallback(): void {
    super.connectedCallback()
    observeLanguage(this)
    this.#inheritedLang = this.lang
    this.localize?.setLocale(this.lang).finally(() => this.requestUpdate())
    this.getAttributeNames().forEach(k => this.setAttribute(k, this.getAttribute(k)))
    this.addEventListener("slotchange", e => this.requestUpdate(), {passive: true})
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    unobserveLanguage(this)
  }
}