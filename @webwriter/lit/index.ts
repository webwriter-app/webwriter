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

/**Minimal base class for a WebWriter widget implemented in Lit. Implements the core properties required by WebWriter, initializes the component when loaded and provides a Scoped Custom Element Registry (@open-wc/scoped-elements) to help with namespace conflicts when using other components in this widget. */
export class LitElementWw extends ScopedElementsMixin(LitElement) {

  static shadowRootOptions = {...LitElement.shadowRootOptions}

  static readonly options: Record<string, OptionDeclaration> = {}
  static readonly actions: Record<string, ActionDeclaration> = {}

  /** Declare attributes as options. Used by WebWriter to auto-generate input fields to modify these attributes. As the name suggests, this is mostly suited to simple attributes (boolean, string, etc.). Use a getter here (`get options() {...}`) to dynamically change options depending on the state of the widget.*/
  readonly options: Record<string, OptionDeclaration>

  /** Declare methods as actions. Used by WebWriter to treat all DOM changes triggered by the method as a single change (as a transaction).*/
  readonly actions: Record<string, ActionDeclaration> = {}

  /** [HTML global attribute] Editing state of the widget. If ="true" or ="", the widget should allow user interaction changing the widget itself. Else, prevent all such user interactions. */
  @property({type: String, attribute: true, reflect: true}) accessor contentEditable!: string

  /** [HTML global attribute] Language of the widget, allowing presentation changes for each language.*/
  @property({type: String, attribute: true, reflect: true}) accessor lang!: string

  /** @internal */
  _inTransaction = false

  connectedCallback(): void {
    super.connectedCallback()
    this.getAttributeNames().forEach(k => this.setAttribute(k, this.getAttribute(k)))
  }
}