import {EditorFeature} from "."
import {
  formAttributeOptions,
  formDefaultHTML,
  formElementSelector,
  formTextElementTypes,
  isFormElementType,
  type FormElementType,
  type FormSelectionState,
} from "../form"
import {$, formControlForInteraction, isElement} from "../utility"

/** Form insertion and DOM-derived editing. Native controls capture selection
 * so their own focus, caret, and value UI remain usable, while value state is
 * mirrored back into authored attributes/text for collaboration. */
export class FormFeature extends EditorFeature {
  protected handlesFormControlInteractions = true

  activeListeners = {
    pointerdown: (event: PointerEvent) => {
      if(event.button === 0) this.captureControl(event)
    },
    focusin: (event: FocusEvent) => this.captureControl(event),
    input: (event: Event) => this.syncNativeControl(event),
    change: (event: Event) => this.syncNativeControl(event),
    submit: (event: SubmitEvent) => event.preventDefault(),
    reset: (event: Event) => event.preventDefault(),
  }

  actions = {
    insertFormElement: ({element}: {type: "insertFormElement", element: FormElementType}) => {
      if(!isFormElementType(element)) throw new TypeError(`Unsupported form element '${String(element)}'`)
      const template = document.createElement("template")
      template.innerHTML = formDefaultHTML(element)
      const inserted = template.content.firstElementChild
      if(!inserted) return
      this.editor.features.manipulation.insert(template.content)
      if(inserted.isConnected) {
        $.selectElement(inserted)
        this.editor.features.selection.processSelection()
        this.editor.postSelectionPath(true)
      }
    },
    setFormAttribute: ({name, value}: {type: "setFormAttribute", name: string, value: string | null}) => {
      const element = this.selectedFormElement()
      if(!element || !this.isEditableAttributeName(name)) {
        throw new TypeError(`Attribute '${name}' is not editable for the selected form element`)
      }
      if(name === "class") this.setAuthoredClasses(element, value)
      else value === null ? element.removeAttribute(name) : element.setAttribute(name, value)
      this.editor.postSelectionPath()
    },
    setFormText: ({value}: {type: "setFormText", value: string}) => {
      const element = this.selectedFormElement()
      if(!element || !this.hasEditableText(element)) {
        throw new TypeError("The selected form element has no editable text value")
      }
      if(element.localName === "label") this.setDirectText(element, value)
      else element.textContent = value
      this.editor.postSelectionPath()
    },
    addFormField: (_: {type: "addFormField"}) => this.addField(),
    addFormLegend: (_: {type: "addFormLegend"}) => this.addLegend(),
    addFormOption: (_: {type: "addFormOption"}) => this.addOption(),
    addFormOptionGroup: (_: {type: "addFormOptionGroup"}) => this.addOptionGroup(),
    customizeFormSelect: (_: {type: "customizeFormSelect"}) => this.customizeSelect(),
  } as const

  getState(): FormSelectionState | undefined {
    const element = this.selectedFormElement()
    if(!element) return
    const type = element.localName as FormElementType
    const hasEditableText = this.hasEditableText(element)
    const attributes = Object.fromEntries(Array.from(element.attributes).flatMap(attribute => {
      if(attribute.name !== "class") return [[attribute.name, attribute.value]]
      const classes = this.authoredClasses(attribute.value)
      return classes ? [["class", classes]] : []
    }))
    return {
      type,
      attributes,
      ...(hasEditableText ? {
        text: type === "label" ? this.directText(element) : element.textContent ?? "",
      } : {}),
      ...(element.matches("form, fieldset") ? {canAddField: true} : {}),
      ...(element.matches("fieldset") && !element.querySelector(":scope > legend") ? {canAddLegend: true} : {}),
      ...(element.matches("select, datalist, optgroup") ? {canAddOption: true} : {}),
      ...(element.matches("select") ? {
        canAddOptionGroup: true,
        canCustomizeSelect: !element.hasAttribute("multiple") && !element.querySelector(":scope > button"),
      } : {}),
    }
  }

  private selectedFormElement() {
    const captured = this.editor.features.selection.captureSelectedElement
    if(captured?.matches(formElementSelector)) return captured
    const selected = $.selectedElement
    if(selected?.matches(formElementSelector)) return selected
    const container = $.anchorContainer
    return isElement(container) ? container.closest(formElementSelector) : null
  }

  private captureControl(event: Event) {
    const control = formControlForInteraction(event)
    if(!control || this.editor.features.selection.captureSelectedElement === control) return control
    this.editor.features.selection.captureElement(control)
    this.editor.postSelectionPath()
    return control
  }

  /** Native controls keep mutable UI state outside their serialized markup.
   * Mirror it immediately so the live authored DOM remains authoritative and
   * the normal DOM observer can collaborate and undo the change. */
  private syncNativeControl(event: Event) {
    const control = this.captureControl(event) ?? formControlForInteraction(event)
    if(!control) return
    if(control instanceof HTMLInputElement) {
      if(control.type === "checkbox") {
        control.toggleAttribute("checked", control.checked)
      }
      else if(control.type === "radio") {
        if(control.name) {
          Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
            .filter(candidate => candidate.name === control.name && candidate.form === control.form)
            .forEach(candidate => candidate.toggleAttribute("checked", candidate.checked))
        }
        else {
          control.toggleAttribute("checked", control.checked)
        }
      }
      else if(control.type !== "file" && control.type !== "password") {
        control.setAttribute("value", control.value)
      }
    }
    else if(control instanceof HTMLTextAreaElement) {
      control.textContent = control.value
    }
    else if(control instanceof HTMLSelectElement) {
      Array.from(control.options).forEach(option => option.toggleAttribute("selected", option.selected))
    }
    this.editor.postSelectionPath()
  }

  private isEditableAttributeName(name: string) {
    if(!name || name !== name.trim() || name === "style" || name === "contenteditable" || name === "spellcheck" || name === "inert") {
      return false
    }
    try {
      const probe = document.createElement("div")
      probe.setAttribute(name, "")
      return true
    }
    catch {
      return false
    }
  }

  private hasEditableText(element: Element) {
    return (formTextElementTypes as readonly string[]).includes(element.localName)
      && !element.matches("button:has(> selectedcontent)")
  }

  private directText(element: Element) {
    return Array.from(element.childNodes)
      .filter((node): node is Text => node.nodeType === Node.TEXT_NODE)
      .map(node => node.data)
      .join("")
  }

  private setDirectText(element: Element, value: string) {
    const textNodes = Array.from(element.childNodes)
      .filter((node): node is Text => node.nodeType === Node.TEXT_NODE)
    if(textNodes[0]) textNodes[0].data = value
    else element.prepend(document.createTextNode(value))
    textNodes.slice(1).forEach(node => node.remove())
  }

  private authoredClasses(value: string | null) {
    return (value ?? "").split(/\s+/).filter(name => name && !name.startsWith("◆")).join(" ")
  }

  private setAuthoredClasses(element: Element, value: string | null) {
    const markers = Array.from(element.classList).filter(name => name.startsWith("◆"))
    const authored = this.authoredClasses(value)
    const classes = [...markers, ...authored.split(/\s+/).filter(Boolean)]
    classes.length ? element.setAttribute("class", classes.join(" ")) : element.removeAttribute("class")
  }

  private selectedContainer(selector: string) {
    const element = this.selectedFormElement()
    return element?.matches(selector) ? element : element?.closest(selector) ?? null
  }

  private finishStructureChange(element: Element) {
    $.selectElement(element)
    this.editor.features.selection.processSelection()
    this.editor.postSelectionPath()
  }

  private addField() {
    const container = this.selectedContainer("form, fieldset")
    if(!container) return
    const label = document.createElement("label")
    label.append("Field ")
    const input = document.createElement("input")
    input.setAttribute("name", "field")
    input.setAttribute("placeholder", "Enter a value")
    label.append(input)
    container.append(label)
    this.finishStructureChange(input)
  }

  private addLegend() {
    const fieldset = this.selectedContainer("fieldset")
    if(!fieldset || fieldset.querySelector(":scope > legend")) return
    const legend = document.createElement("legend")
    legend.textContent = "Legend"
    fieldset.prepend(legend)
    this.finishStructureChange(legend)
  }

  private addOption() {
    const container = this.selectedContainer("select, datalist, optgroup")
    if(!container) return
    const option = document.createElement("option")
    const number = container.querySelectorAll("option").length + 1
    option.value = `option-${number}`
    option.textContent = `Option ${number}`
    container.append(option)
    this.finishStructureChange(option)
  }

  private addOptionGroup() {
    const select = this.selectedContainer("select")
    if(!select) return
    const group = document.createElement("optgroup")
    group.label = "Option group"
    const option = document.createElement("option")
    option.value = "option"
    option.textContent = "Option"
    group.append(option)
    select.append(group)
    this.finishStructureChange(group)
  }

  private customizeSelect() {
    const select = this.selectedContainer("select")
    if(!select || select.hasAttribute("multiple") || select.querySelector(":scope > button")) return
    const button = document.createElement("button")
    button.setAttribute("type", "button")
    button.append(document.createElement("selectedcontent"))
    select.prepend(button)
    this.finishStructureChange(button.firstElementChild!)
  }
}
