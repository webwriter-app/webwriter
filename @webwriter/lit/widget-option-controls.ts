import {html, nothing, type TemplateResult} from "lit"
import {repeat} from "lit/directives/repeat.js"
import {formatWidgetDuration, parseWidgetDuration, widgetTreeLeaves, widgetOptionValue, type WidgetOptionTreeNode, type WidgetOptionValue, type WidgetOptionState, type WidgetActionState, type WidgetOptionGroupState} from "./widget-options"

function widgetOptionInputValue(option: WidgetOptionState, target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): WidgetOptionValue | undefined {
  if(option.type === "boolean") return (target as HTMLInputElement).checked
  if(option.type === "select" && option.multiple) {
    return Array.from((target as HTMLSelectElement).selectedOptions, choice => choice.value)
  }
  if(option.type === "number") {
    if(!target.value.trim()) return null
    if(option.control !== "duration") return Number(target.value)
    const value = parseWidgetDuration(target.value)
    const increments = option.step && option.step > 0 ? (value! - (option.min ?? 0)) / option.step : 0
    if(value === undefined || option.min !== undefined && value < option.min || option.max !== undefined && value > option.max
      || Math.abs(increments - Math.round(increments)) > 1e-7) {
      target.setCustomValidity("Enter a duration in seconds, m:ss, or h:mm:ss within the allowed range and step")
      target.reportValidity()
      return undefined
    }
    return value
  }
  if(option.type === "object" || option.type === "array") {
    if(!target.value.trim()) return null
    try { return widgetOptionValue(JSON.parse(target.value)) }
    catch {
      (target as HTMLTextAreaElement).setCustomValidity("Enter valid JSON")
      target.reportValidity()
      return undefined
    }
  }
  return target.value
}

export function renderWidgetOptionField(
  option: WidgetOptionState,
  dispatch: (name: string, value: WidgetOptionValue) => void,
  fieldScope = "",
  editor?: {label: TemplateResult, safeColor: (value: string) => string},
) {
  if(option.hidden) return nothing
  const locked = Boolean(option.disabled || option.readOnly)
  const commit = (value: WidgetOptionValue) => { if(!locked) dispatch(option.name, value) }
  const change = (event: Event) => {
    if(locked) return
    const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    if("setCustomValidity" in target) target.setCustomValidity("")
    if("checkValidity" in target && !target.checkValidity()) { target.reportValidity(); return }
    const value = widgetOptionInputValue(option, target)
    if(value !== undefined) commit(value)
  }
  const help = html`${option.description ? html`<span class="develop-field-help">${option.description}</span>` : nothing}
    ${option.disabledReason && locked ? html`<span class="develop-field-help">${option.disabledReason}</span>` : nothing}`
  const unit = option.unit ? html`<span class="widget-option-unit">${option.unit}</span>` : nothing
  const label = editor?.label ?? html`<span class="develop-field-label" id=${`widget-${fieldScope}${option.name}`}>${option.label}</span>`
  if(option.type === "boolean") return html`
    <label class="develop-field widget-option-checkbox" title=${option.disabledReason ?? option.description ?? ""}>
      <input type="checkbox" class=${option.control === "switch" ? "editor-switch" : nothing} role=${option.control === "switch" ? "switch" : nothing}
        .checked=${option.value === true} ?disabled=${locked} @change=${change} />
      <span class="develop-field-label">${option.label}</span>${unit}
    </label>${help}
  `
  const text = option.value === null ? "" : typeof option.value === "object" ? JSON.stringify(option.value, undefined, 2) : String(option.value)
  if(option.type === "select" && option.control === "tree") {
    const selected = new Set(Array.isArray(option.value) ? option.value.filter((value): value is string => typeof value === "string") : [])
    const toggle = (values: string[], checked: boolean) => {
      const next = new Set(selected)
      for(const value of values) checked ? next.add(value) : next.delete(value)
      commit([...next])
    }
    const checkbox = (nodes: WidgetOptionTreeNode[], label: string, group?: string) => {
      const values = widgetTreeLeaves(nodes).map(node => node.value)
      const count = values.filter(value => selected.has(value)).length
      return html`<label><input type="checkbox" data-tree-group=${group ?? nothing} ?data-tree-select-all=${group === undefined}
        .checked=${values.length > 0 && count === values.length} .indeterminate=${count > 0 && count < values.length}
        ?disabled=${locked || !values.length} @click=${(event: Event) => event.stopPropagation()}
        @change=${(event: Event) => toggle(values, (event.currentTarget as HTMLInputElement).checked)} />${label}</label>`
    }
    const renderNodes = (nodes: WidgetOptionTreeNode[]): TemplateResult => html`<ul>${nodes.map(node => html`<li>
      ${node.children ? html`<details><summary>${checkbox(node.children, node.label, node.label)}</summary>
        ${renderNodes(node.children)}</details>` : html`<label title=${node.description ?? ""}>
        <input type="checkbox" data-value=${node.value} .checked=${selected.has(node.value!)} ?disabled=${locked}
          @change=${(event: Event) => toggle([node.value!], (event.currentTarget as HTMLInputElement).checked)} />${node.label}</label>`}
    </li>`)}</ul>`
    return html`<div class="develop-field widget-option-field">${label}
      <div class="widget-option-tree" role="group" aria-label=${option.label}>
        ${checkbox(option.tree ?? [], "Select all")}${renderNodes(option.tree ?? [])}
      </div>${help}</div>`
  }
  if(option.type === "select" && (option.control === "radio" || option.control === "segmented")) {
    const labelId = `widget-${fieldScope}${option.name}`
    return html`<div class="develop-field widget-option-field">
      ${label}
      <div class=${option.control === "segmented" ? "choice-group widget-option-segmented" : "widget-option-radios"}
        style=${option.control === "segmented" ? `--choice-columns: ${Math.max(1, Math.min(4, option.choices?.length ?? 1))}` : nothing}
        role="group" aria-labelledby=${labelId}>
        ${(option.choices ?? []).map(choice => option.control === "radio" ? html`
          <label><input type="radio" name=${labelId} value=${choice.value} .checked=${option.value === choice.value}
            ?disabled=${locked} @change=${() => commit(choice.value)} />${choice.label}</label>` : html`
          <button type="button" aria-pressed=${option.value === choice.value} title=${choice.description ?? choice.label}
            ?disabled=${locked} @click=${() => commit(choice.value)}>${choice.label}</button>`)}
      </div>${unit}${help}
    </div>`
  }
  let field
  if(option.type === "number" && option.control === "duration") {
    field = html`<input type="text" data-duration aria-label=${option.label} inputmode="decimal" .value=${typeof option.value === "number" ? formatWidgetDuration(option.value) : ""}
      placeholder=${option.placeholder ?? "m:ss"} min=${option.min ?? 0} max=${option.max ?? nothing} step=${option.step ?? nothing}
      ?disabled=${option.disabled} ?readonly=${option.readOnly} @change=${change} />`
  }
  else if(option.type === "reference" || option.type === "select") {
    const choices = option.choices ?? []
    const missing = Boolean(text && !choices.some(choice => choice.value === text))
    field = editor ? html`<style-combobox .label=${option.label} .editable=${false} .disabled=${locked}
      .multiple=${Boolean(option.multiple)} .values=${Array.isArray(option.value) ? option.value.map(String) : []}
      .value=${text} .placeholder=${option.placeholder ?? "Default"}
      .options=${[...(!option.multiple ? [{value: "", label: "Default"}] : []),
        ...(!option.multiple && missing ? [{value: text, label: option.type === "reference" ? `Missing reference: #${text}` : text,
          disabled: option.type === "reference"}] : []), ...choices]}
      @combobox-change=${(event: CustomEvent<{value: string, values?: string[]}>) => {
        event.stopPropagation()
        if(option.type === "reference" && event.detail.value && !choices.some(choice => choice.value === event.detail.value)) return
        const values = event.detail.values ?? []
        if(option.multiple) commit(choices.length ? values.filter(value => choices.some(choice => choice.value === value)) : values)
        else commit(event.detail.value || null)
      }}></style-combobox>` : html`<select aria-label=${option.label} ?multiple=${option.multiple} ?disabled=${locked} @change=${change}>
      ${option.multiple ? nothing : html`<option value="" .selected=${!text}>${option.placeholder ?? "Default"}</option>`}
      ${!option.multiple && missing ? html`<option .value=${text} .selected=${true} ?disabled=${option.type === "reference"}>${option.type === "reference" ? `Missing reference: #${text}` : text}</option>` : nothing}
      ${choices.map(choice => html`<option .value=${choice.value}
        .selected=${Array.isArray(option.value) ? option.value.includes(choice.value) : choice.value === text}>${choice.label}</option>`)}
    </select>`
  }
  else if(option.type === "number" && option.control === "range") {
    const steps = [...new Set(option.steps ?? [])].sort((a, b) => a - b)
      .filter(value => (option.min === undefined || value >= option.min) && (option.max === undefined || value <= option.max))
    const discrete = steps.length > 0
    const value = typeof option.value === "number" ? option.value : option.min ?? steps[0] ?? 0
    field = html`<input type="range" aria-label=${option.label} min=${discrete ? 0 : option.min ?? 0} max=${discrete ? steps.length - 1 : option.max ?? 100}
      step=${discrete ? 1 : option.step ?? 1} .value=${String(discrete ? Math.max(0, steps.indexOf(value)) : value)}
      aria-valuetext=${`${text}${option.unit ? ` ${option.unit}` : ""}`} ?disabled=${locked}
      @input=${(event: Event) => {
        const input = event.currentTarget as HTMLInputElement
        commit(discrete ? steps[Number(input.value)] : Number(input.value))
      }} /><output>${text}</output>`
  }
  else if(editor && option.type === "number" && option.control !== "input") {
    const candidates = option.steps?.length ? option.steps : [option.min ?? 0,
      (option.min ?? 0) + (option.step ?? 1), option.max ?? (option.min ?? 0) + 10 * (option.step ?? 1)]
    const presets = [...new Set(candidates)].filter(value => (option.min === undefined || value >= option.min)
      && (option.max === undefined || value <= option.max))
    field = html`<style-combobox .showValue=${true} .label=${`${option.label}${option.unit ? ` (${option.unit})` : ""}`} .value=${text}
      .unit=${option.unit ?? ""} .disabled=${locked} .placeholder=${option.placeholder ?? "Default"}
      .options=${presets.map((value, index) => ({value: String(value), label: option.steps?.length ? "Value" : ["Low", "Medium", "High"][index]}))}
      @combobox-change=${(event: CustomEvent<{value: string}>) => {
        event.stopPropagation()
        const draft = event.detail.value.trim()
        const value = Number(draft)
        // Keep the explicit number field's native constraints when using presets.
        const input = document.createElement("input")
        input.type = "number"
        input.required = true
        if(option.min !== undefined) input.min = String(option.min)
        if(option.max !== undefined) input.max = String(option.max)
        input.step = option.step === undefined ? "any" : String(option.step)
        input.value = draft
        if(!draft || Number.isFinite(value) && input.checkValidity() && (!option.steps?.length || option.steps.includes(value))) {
          commit(draft ? value : null)
        }
        else {
          const combo = event.currentTarget as HTMLElement & {value: string, close: (cancel: boolean) => void}
          combo.value = text
          combo.close(true)
        }
      }}></style-combobox>`
  }
  else if(option.type === "color") {
    field = editor ? html`<ribbon-combobox variant="color" .name=${`widget-${fieldScope}${option.name}`} .label=${option.label}
      .value=${editor.safeColor(text)} .swatches=${option.swatches ?? []} .disabled=${locked}
      @ribbon-combobox-change=${(event: CustomEvent<{value: string}>) => {
        event.stopPropagation()
        commit(event.detail.value || null)
      }}></ribbon-combobox>` : html`<input type="color" aria-label=${option.label} .value=${text}
      ?disabled=${locked} @change=${change} />
      ${option.swatches?.length ? html`<select aria-label=${`${option.label} presets`} ?disabled=${locked} @change=${change}>
        <option value="" .selected=${!option.swatches.includes(text)}>Custom</option>
        ${option.swatches.map(color => html`<option .value=${color} .selected=${color === text}>${color}</option>`)}
      </select>` : nothing}`
  }
  else if(option.type === "object" || option.type === "array") {
    field = html`<textarea data-json aria-label=${option.label} spellcheck="false" .value=${text} placeholder=${option.placeholder ?? ""}
      ?disabled=${option.disabled} ?readonly=${option.readOnly} @change=${change}></textarea>`
  }
  else if(option.type === "string" && option.multiline) {
    field = html`<textarea aria-label=${option.label} .value=${text} placeholder=${option.placeholder ?? ""}
      ?disabled=${option.disabled} ?readonly=${option.readOnly}
      minlength=${option.minlength ?? nothing} maxlength=${option.maxlength ?? nothing} @change=${change}></textarea>`
  }
  else {
    field = html`<input type=${option.type === "string" ? "text" : option.type} aria-label=${option.label} .value=${text} placeholder=${option.placeholder ?? ""}
      ?disabled=${option.disabled} ?readonly=${option.readOnly}
      min=${option.min ?? nothing} max=${option.max ?? nothing} step=${option.step ?? (!editor && option.type === "number" ? "any" : nothing)}
      pattern=${option.pattern ?? nothing} minlength=${option.minlength ?? nothing} maxlength=${option.maxlength ?? nothing}
      @change=${change} />`
  }
  return html`<div class="develop-field widget-option-field">${label}
    <span class="widget-option-value">${field}${editor && option.type === "number" && !option.control ? nothing : unit}</span>${help}</div>`
}


export function renderWidgetOptions(
  options: WidgetOptionState[],
  actions: WidgetActionState[],
  groups: readonly WidgetOptionGroupState[],
  renderField: (option: WidgetOptionState) => TemplateResult | typeof nothing,
  renderActions: (actions: WidgetActionState[]) => TemplateResult | typeof nothing,
) {
  const visibleOptions = options.filter(option => !option.hidden)
  const visibleActions = actions.filter(action => !action.hidden)
  if(!visibleOptions.length && !visibleActions.length) return nothing
  const fields = (group?: string) => html`
    ${visibleOptions.filter(option => (option.group || undefined) === group)
      .map(renderField)}
    ${renderActions(visibleActions.filter(action => (action.group || undefined) === group))}`
  const usedGroups = [...groups]
  for(const item of [...visibleOptions, ...visibleActions]) {
    if(item.group && !usedGroups.some(group => group.name === item.group)) usedGroups.push({name: item.group, label: item.group})
  }
  return html`<div class="widget-options">${fields()}
    ${repeat(usedGroups.filter(group => [...visibleOptions, ...visibleActions].some(item => item.group === group.name)), group => group.name, group => html`
      <section class="widget-option-group" data-group=${group.name}>
        ${group.collapsible || group.advanced ? html`<details .open=${!group.collapsed && !group.advanced}>
          <summary>${group.label}</summary>
          ${group.description ? html`<p class="develop-field-help">${group.description}</p>` : nothing}
          <div class="widget-option-group-fields">${fields(group.name)}</div>
        </details>` : html`<strong>${group.label}</strong>
          ${group.description ? html`<p class="develop-field-help">${group.description}</p>` : nothing}
          <div class="widget-option-group-fields">${fields(group.name)}</div>`}
      </section>`)}
  </div>`
}
