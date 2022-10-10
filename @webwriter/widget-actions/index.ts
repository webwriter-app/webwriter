import "@shoelace-style/shoelace/dist/themes/light.css"

import {html, LitElement, PropertyDeclaration} from "lit"
import {customElement, property} from "lit/decorators.js"
import SlSwitch from "@shoelace-style/shoelace/dist/components/switch/switch.js"
import SlInput from "@shoelace-style/shoelace/dist/components/input/input.js"
import {ScopedElementsMixin} from "@open-wc/scoped-elements"


const TEST_FIELDS: Record<string, PropertyFieldDeclaration> = {
  "test": {converter: Boolean}
}

const TEST_VALUES: Record<string, any> = {
  "test": false
}

function camelCaseToSpacedCase(str: string, capitalizeFirstLetter=true) {
  const spacedStr = str.replace(/([A-Z][a-z]|[0-9])+/g, " $&")
  return capitalizeFirstLetter? spacedStr.replace(/^[a-z]/g, match => match.toUpperCase()): spacedStr
}

type PropertyFieldDeclaration = PropertyDeclaration & {
  label?: string
}

@customElement("ww-widget-actions")
class WwWidgetActions extends ScopedElementsMixin(LitElement) {

  @property({attribute: false})
  propertyFields: Record<string, PropertyFieldDeclaration> = {
    "test": {converter: Boolean}
  }

  @property({attribute: false})
  propertyValues: Record<string, any> = {
    "test": false
  }

  static get scopedElements() {
    return {
      "sl-switch": SlSwitch,
      "sl-input": SlInput
    }
  }

  emitChange(key: string, value: any) {
    this.dispatchEvent(new CustomEvent("ww-change", {composed: true, bubbles: true, detail: {key, value}}))
  }

  propertyFieldTemplate = (key: string) => {
    const {converter} = this.propertyFields[key]
    const value = this.propertyValues[key]

    if(converter === Boolean) {
      return html`<sl-switch 
        value=${value} 
        @sl-change=${e => this.emitChange(key, e.target.value)}>
        ${camelCaseToSpacedCase(key)}
      </sl-switch>`
    }
    else if(converter === String) {
      return html``
    }
    else if(converter === Number) {
      return html``
    }
    else if(converter === Object) {
      return html``
    }
    else if(converter === Array) {
      return html``
    }
  }

  render() {
    return Object.keys(this.propertyValues).map(this.propertyFieldTemplate)
  }
}