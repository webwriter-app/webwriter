export * from "./alignmentpicker"
export * from "./borderpicker"
export * from "./fontpicker"
export * from "./lineheightpicker"
export * from "./backgroundpicker"
export * from "./boxpicker"

import {LitElement, PropertyValues, html} from "lit"
import {property} from "lit/decorators.js"
import { CSSPropertySpecs } from "../../../model/schemas/cssvaluedefinition.data"
import { filterObject } from "../../../model/utility"
import { CSSValueDefinition, ICSSValueDefinition } from "../../../model/schemas/cssvaluedefinition"
import { ifDefined } from "lit/directives/if-defined.js"
import { SlCheckbox, SlColorPicker, SlRadioGroup, SlRange, SlSelect, SlSwitch } from "@shoelace-style/shoelace"
import { Combobox } from "../ui/combobox"
import { CSSNumericInput } from "../datainputs/cssnumericinput"
import { CSSPropertyInput } from "../datainputs/csspropertyinput"
import { CSSBorderRadiusInput } from "../datainputs/cssborderradiusinput"
import { CSSLineTypeInput } from "../datainputs/csslinetypeinput"


function createCSSStyleDeclaration(text: string = ""): CSSStyleDeclaration {
  const sheet = new CSSStyleSheet()
  sheet.insertRule(`*{${text}}`)
  return (sheet.cssRules.item(0) as CSSStyleRule).style
}

export abstract class LitPickerElement<T extends keyof CSSPropertySpecs = keyof CSSPropertySpecs> extends LitElement {

  handlers: Record<string, (target?: HTMLElement) => void> = {}

  get emptyValue() {
    return createCSSStyleDeclaration()
  }

  propertyNames: Readonly<Array<T>> = []

  // key: "" - no value
  // key: "inherit" | "unset" | ...
  #value: CSSStyleDeclaration = this.emptyValue

  @property({attribute: false})
  get value(): Record<T, string> {
    return Object.fromEntries(this.propertyNames.map(name => [name, this.#value.getPropertyValue(name)])) as Record<T, string>
  }

  get empty() {
    return Object.values(this.value).every(v => !v)
  }

  set value(v: Record<T, string> | CSSStyleDeclaration) {
    if(!v) {
      this.#value = this.emptyValue
    }
    else if("getPropertyValue" in v) {
      this.#value = v
    }
    else {
      this.propertyNames.forEach(name => name in v? this.#value.setProperty(name, v[name]): undefined)
    }
    this.requestUpdate("value")
  }

  protected setPartialValue(name: T, value: string) {
    this.#value.setProperty(name, value)
    this.requestUpdate("value")
  }

  @property({attribute: false})
  computedValue?: CSSStyleDeclaration = undefined

  protected getCurrentValue(name: T, noComputed=false) {
    const isGlobal = !["custom", "none"].includes(this.getGlobalValue(name))
    return isGlobal || !this.value[name]
      ? (!noComputed? this.computedValue?.getPropertyValue(name): undefined) ?? ""
      : this.value[name]
  }

  protected getGlobalValue(name: T): "initial" | "inherit" | "unset" | "revert" | "revert-layer" | "custom" | "none" {
    return ["initial", "inherit", "unset", "revert", "revert-layer"].includes(this.value[name])
      ? this.value[name] as "initial" | "inherit" | "unset" | "revert" | "revert-layer"
      : (this.value[name]? "custom": "none")
  }

  restore(name: T) {
    if(name in this.handlers) {
      this.handlers[name]()
    }
    else {
      this.#value.removeProperty(name)
    }
  }

  restoreAll() { // fix this
    this.#value = this.emptyValue
  }

  protected getInputValue(name: string, el?: HTMLElement) {
    const target = el ?? this.shadowRoot!.querySelector(`[name="${name}"]:not([data-inactive])`) as HTMLElement & {name: string, value: any}
    const globalInput = (target.querySelector("css-global-input") as HTMLElement & {value: string}) ?? (target.parentElement!.querySelector("css-global-input") as HTMLElement & {value: string})
    return !globalInput || ["custom", "none"].includes(globalInput.value)
      ? (target as any).value
      : globalInput.value
  }

  protected resolveChange = (name: T, el?: HTMLElement, value?: string) => {
    const target = el ?? this.shadowRoot!.querySelector(`[name="${name}"]:not([data-inactive])`) as HTMLElement
    const globalInput = (target?.querySelector("css-global-input") as HTMLElement & {value: string}) ?? (target?.parentElement!.querySelector("css-global-input") as HTMLElement & {value: string})
    
    if(globalInput) {
      globalInput.value = "custom"
    }

    if(name in this.handlers && !value) {
      this.handlers[name](target)
    }
    else if(name in CSSPropertySpecs && [SlRadioGroup, SlSelect, Combobox, SlColorPicker, CSSNumericInput, CSSPropertyInput, CSSBorderRadiusInput, CSSLineTypeInput, SlRange].some(cls => target instanceof cls)) {
      this.#value.setProperty(name, value ?? String(this.getInputValue(name, el)))
    }
    else if(name in CSSPropertySpecs && [SlCheckbox, SlSwitch].some(cls => target instanceof cls)) {
      const defaultValue = target.dataset.defaultvalue!
      const otherValue = target.dataset.othervalue!
      let v = value ?? ((target as any).checked? otherValue: defaultValue)
      this.#value.setProperty(name, v)
    }
    else {
      throw Error("Unknown key: " + name)
    }
  }

  handleChange = (e: {target: HTMLElement & {name: string, value: any, defaultValue?: string}}) => {
    this.resolveChange(e.target.name as T)
    this.requestUpdate("value")
    this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  }

  handleRestore(name: T) {
    this.restore(name)
    this.requestUpdate("value")
    this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  }

  firstUpdated(_changedProperties: PropertyValues): void {
    super.firstUpdated(_changedProperties)
    const inputs: Array<HTMLElement & {name: string, value: any}> = Array.from(this.shadowRoot?.querySelectorAll(":not(sl-icon)[name]") ?? [])
    inputs?.forEach(input => {
      (input as any).addEventListener("sl-change", this.handleChange);
      (input as any).addEventListener("change", this.handleChange);
      ((input as any).querySelector("css-global-input") ?? (input as any).parentElement!.querySelector("css-global-input"))?.addEventListener("ww-restore", () => this.handleRestore((input as any).name));
    })
  }

  @property({type: Boolean, attribute: true, reflect: true})  
  advanced = false
}