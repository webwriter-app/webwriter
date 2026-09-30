import {LitElement, css, html, nothing} from "lit"
import {defaultGroupingRules, formWidgetGroups, validateGroupingRules} from "../widget-grouping.js"
import type {WidgetGroupingContext, WidgetGroupingRules} from "../widget-grouping"

let manualGroupSequence = 0
const newManualGroupId = () => {
  if(globalThis.crypto?.randomUUID) return `manual-${globalThis.crypto.randomUUID()}`
  manualGroupSequence++
  return `manual-${Date.now().toString(36)}-${manualGroupSequence.toString(36)}`
}

export class WidgetGroupingDialog extends LitElement {
  static properties = {
    rules: {attribute: false, state: true}, context: {attribute: false, state: true},
    loading: {type: Boolean, state: true}, offline: {type: Boolean, state: true},
    error: {type: String, state: true}, preview: {attribute: false, state: true},
  }
  static styles = css`
    :host { color: #202833; font: 14px/1.4 system-ui, sans-serif; }
    dialog { box-sizing: border-box; width: min(58rem, calc(100vw - 2rem)); max-height: min(48rem, calc(100dvh - 2rem)); padding: 0; border: 1px solid #cbd5e1; border-radius: .7rem; color: inherit; background: white; box-shadow: 0 1rem 3rem rgb(15 23 42 / 25%); }
    dialog::backdrop { background: rgb(15 23 42 / 42%); }
    .shell { display: flex; flex-direction: column; max-height: min(48rem, calc(100dvh - 2rem)); }
    header, footer { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .85rem 1rem; border-bottom: 1px solid #e2e8f0; }
    footer { justify-content: flex-end; border-top: 1px solid #e2e8f0; border-bottom: 0; }
    h2, h3, p { margin: 0; } h2 { font-size: 1rem; } h3 { font-size: .85rem; }
    .content { padding: 1rem; overflow: auto; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
    .wide { grid-column: 1 / -1; }
    label { display: grid; min-width: 0; gap: .3rem; color: #334155; font-size: .76rem; font-weight: 600; }
    input, select { box-sizing: border-box; width: 100%; min-height: 2.25rem; padding: .4rem .5rem; border: 1px solid #cbd5e1; border-radius: .35rem; color: #0f172a; background: white; font: inherit; font-size: .8rem; font-weight: 400; }
    input[type=checkbox] { width: auto; min-height: auto; } .check { display: flex; align-items: center; gap: .45rem; font-weight: 500; }
    .hint, .status { color: #64748b; font-size: .75rem; font-weight: 400; } .status { margin-bottom: .75rem; } .error { color: #b42318; }
    .manual { display: grid; gap: .65rem; margin-top: .75rem; }
    .manual-group { display: grid; grid-template-columns: minmax(7rem, .7fr) minmax(0, 1.3fr) auto; gap: .5rem; align-items: start; padding: .65rem; border: 1px solid #e2e8f0; border-radius: .45rem; }
    .manual-group select { min-height: 5rem; }
    button { min-height: 2rem; padding: .4rem .7rem; border: 1px solid #cbd5e1; border-radius: .35rem; color: #25344a; background: #fff; font: inherit; cursor: pointer; }
    button.primary { border-color: #2563eb; color: #fff; background: #2563eb; } button:disabled { cursor: default; opacity: .55; }
    .preview { display: grid; gap: .3rem; margin-top: .65rem; padding: .65rem; border-radius: .4rem; background: #f8fafc; font-size: .75rem; }
    @media (max-width: 38rem) { .grid, .manual-group { grid-template-columns: 1fr; } .wide { grid-column: auto; } }
  `

  rules: WidgetGroupingRules = defaultGroupingRules()
  context: WidgetGroupingContext | null = null
  loading = false
  offline = false
  error = ""
  preview: {id: string; name: string; members: string[]}[] | null = null
  private resolveShow?: (value: WidgetGroupingRules | null | undefined) => void
  private sequence = 0
  private contextLoaded = false

  async show(rules: WidgetGroupingRules | null, loadContext: () => Promise<WidgetGroupingContext>): Promise<WidgetGroupingRules | null | undefined> {
    if(!this.isConnected) { this.close(undefined); return undefined }
    const sequence = ++this.sequence
    this.resolveShow?.(undefined)
    this.rules = rules ? validateGroupingRules(rules) : defaultGroupingRules()
    this.context = null; this.contextLoaded = false; this.loading = true; this.offline = false; this.error = ""; this.preview = null
    await this.updateComplete
    if(sequence !== this.sequence) return undefined
    await this.updateComplete
    if(sequence !== this.sequence) return undefined
    const dialog = this.shadowRoot!.querySelector("dialog")!
    if(!dialog.open) dialog.showModal()
    const result = new Promise<WidgetGroupingRules | null | undefined>(resolve => { this.resolveShow = resolve })
    void Promise.resolve().then(loadContext).then(context => {
      if(sequence !== this.sequence) return
      if(!context?.canManage) this.error = "You do not have permission to manage participant groups."
      else { this.context = context; this.contextLoaded = true }
    }).catch(error => {
      if(sequence !== this.sequence) return
      const failure = error as {status?: number; statusCode?: number; name?: string; message?: string}
      const denied = failure?.status === 401 || failure?.status === 403 || failure?.statusCode === 401 || failure?.statusCode === 403
      const connectedError = !denied && (failure?.name === "TypeError" || failure?.name === "NetworkError" || /offline|network|fetch failed|connection|connect the document/i.test(failure?.message ?? ""))
      if(connectedError) { this.offline = true; this.error = "Roster unavailable while offline. Automatic rules can still be saved." }
      else this.error = "Could not load grouping permissions or roster. Grouping changes are disabled."
    }).finally(() => {
      if(sequence === this.sequence) this.loading = false
    })
    return result
  }

  disconnectedCallback() { super.disconnectedCallback(); this.close(undefined) }
  private close(value: WidgetGroupingRules | null | undefined) {
    this.sequence++
    const dialog = this.shadowRoot?.querySelector("dialog")
    const resolve = this.resolveShow; this.resolveShow = undefined; resolve?.(value)
    if(dialog?.open) dialog.close()
  }
  private canEdit() { return this.contextLoaded && Boolean(this.context?.canManage) && !this.loading }
  private canSave() { return !this.loading && (this.canEdit() || this.offline && this.rules.method === "automatic") }
  private updateRule<K extends keyof WidgetGroupingRules>(key: K, value: WidgetGroupingRules[K]) {
    const next = {...this.rules, [key]: value}
    if(key === "sourceGroupId" && value) next.sourceGroupingId = ""
    if(key === "sourceGroupingId" && value) next.sourceGroupId = ""
    this.rules = next
    this.preview = null
  }
  private text(key: keyof WidgetGroupingRules, event: Event) { this.updateRule(key, (event.currentTarget as HTMLInputElement | HTMLSelectElement).value as never) }
  private check(key: keyof WidgetGroupingRules, event: Event) {
    const checked = (event.currentTarget as HTMLInputElement).checked
    if(key === "ignoreGrouped" && checked) this.rules = {...this.rules, ignoreGrouped: true, sourceGroupId: "", sourceGroupingId: ""}
    else this.updateRule(key, checked as never)
  }
  private async makePreview() {
    if(!this.context || !this.canEdit()) return
    try { this.preview = formWidgetGroups(validateGroupingRules(this.rules), this.context).groups; this.error = "" }
    catch(error) { this.error = error instanceof Error ? error.message : "Could not preview these rules."; this.preview = null }
  }
  private save(event: SubmitEvent) {
    event.preventDefault()
    if(!this.canSave()) return
    try { const result = validateGroupingRules(this.rules); if(this.contextLoaded && this.context) formWidgetGroups(result, this.context); this.close(result) }
    catch(error) { this.error = error instanceof Error ? error.message : "Please check the grouping rules." }
  }
  private addGroup() { let n = this.rules.manualGroups.length + 1; while(this.rules.manualGroups.some(group => group.name === `Group ${n}`)) n++; this.updateRule("manualGroups", [...this.rules.manualGroups, {id: newManualGroupId(), name: `Group ${n}`, members: []}]) }
  private manual(index: number, patch: Partial<WidgetGroupingRules["manualGroups"][number]>) { this.updateRule("manualGroups", this.rules.manualGroups.map((group, i) => i === index ? {...group, ...patch} : group)) }
  private options(items: {id: string; name: string}[], selected = "") { return html`<option value="">All</option>${items.map(item => html`<option value=${item.id} ?selected=${selected === item.id}>${item.name}</option>`)}` }

  render() {
    const r = this.rules, c = this.context, canEdit = this.canEdit(), canSave = this.canSave()
    const participants = c?.participants ?? [], groupings = c?.groupings ?? []
    return html`<dialog aria-labelledby="grouping-heading" @cancel=${(event: Event) => { event.preventDefault(); this.close(undefined) }} @close=${() => { if(this.resolveShow) this.close(undefined) }}>
      <div class="shell"><header><h2 id="grouping-heading">Participant groups</h2><button type="button" aria-label="Close" @click=${() => this.close(undefined)}>×</button></header>
      <div class="content">
        ${this.loading ? html`<p class="status" role="status">Loading participants…</p>` : nothing}
        ${this.error ? html`<p class="status ${canSave ? "" : "error"}" role="status">${this.error}</p>` : nothing}
        <form id="rules-form" @submit=${this.save}><div class="grid">
          <label>Method<select .value=${r.method} ?disabled=${!canEdit && !this.offline} @change=${(e: Event) => this.text("method", e)}><option value="automatic">Create groups automatically</option><option value="manual">Choose members manually</option><option value="existing">Use an existing grouping</option></select></label>
          ${r.method === "automatic" ? html`
            <label>Group names<input .value=${r.namingScheme} ?disabled=${!canEdit && !this.offline} @input=${(e: Event) => this.text("namingScheme", e)}><span class="hint">Use @ for letters or # for numbers. One group needs no token.</span></label>
            <label>Set the number by<select .value=${r.groupBy} ?disabled=${!canEdit && !this.offline} @change=${(e: Event) => this.text("groupBy", e)}><option value="members">Members per group</option><option value="groups">Number of groups</option></select></label>
            <label>${r.groupBy === "members" ? "Members per group" : "Number of groups"}<input type="number" min="1" max="10000" .value=${String(r.number)} ?disabled=${!canEdit && !this.offline} @input=${(e: Event) => this.updateRule("number", Number((e.currentTarget as HTMLInputElement).value))}></label>
            <label>Allocate participants<select .value=${r.allocateBy} ?disabled=${!canEdit && !this.offline} @change=${(e: Event) => this.text("allocateBy", e)}><option value="random">Random (repeatable)</option><option value="firstname">First name</option><option value="lastname">Last name</option><option value="idnumber">ID number</option><option value="none">Do not allocate</option></select></label>
            ${r.groupBy === "members" ? html`<label class="check"><input type="checkbox" .checked=${r.preventSmallGroup} ?disabled=${!canEdit && !this.offline} @change=${(e: Event) => this.check("preventSmallGroup", e)}>Prevent a small final group</label>` : nothing}
            <label class="check"><input type="checkbox" .checked=${r.activeOnly} ?disabled=${!canEdit && !this.offline} @change=${(e: Event) => this.check("activeOnly", e)}>Active participants only</label>
            <label class="check"><input type="checkbox" .checked=${r.ignoreGrouped} ?disabled=${!canEdit && !this.offline} @change=${(e: Event) => this.check("ignoreGrouped", e)}>Ignore participants already in a group</label>
            <label>Role<select .value=${r.roleId} ?disabled=${!canEdit} @change=${(e: Event) => this.text("roleId", e)}>${this.options(c?.roles ?? [], r.roleId)}</select></label>
            <label>Cohort<select .value=${r.cohortId} ?disabled=${!canEdit} @change=${(e: Event) => this.text("cohortId", e)}>${this.options(c?.cohorts ?? [], r.cohortId)}</select></label>
            <label>Source group<select .value=${r.sourceGroupId} ?disabled=${!canEdit || r.ignoreGrouped || Boolean(r.sourceGroupingId)} @change=${(e: Event) => this.text("sourceGroupId", e)}>${this.options(c?.groups ?? [], r.sourceGroupId)}</select></label>
            <label>Source grouping<select .value=${r.sourceGroupingId} ?disabled=${!canEdit || r.ignoreGrouped || Boolean(r.sourceGroupId)} @change=${(e: Event) => this.text("sourceGroupingId", e)}>${this.options(groupings, r.sourceGroupingId)}</select></label>
          ` : nothing}
          ${r.method === "manual" ? html`<div class="wide"><h3>Manual groups</h3><div class="manual">${r.manualGroups.map((group, index) => html`<section class="manual-group">
            <label>Group name<input .value=${group.name} ?disabled=${!canEdit} @input=${(e: Event) => this.manual(index, {name: (e.currentTarget as HTMLInputElement).value})}></label>
            <label>Participants<select multiple ?disabled=${!canEdit} @change=${(e: Event) => this.manual(index, {members: [...(e.currentTarget as HTMLSelectElement).selectedOptions].map(option => option.value)})}>${participants.map(person => html`<option value=${person.id} ?selected=${group.members.includes(person.id)}>${person.firstName || person.lastName ? `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() : person.id}</option>`)}</select></label>
            <button type="button" ?disabled=${!canEdit} @click=${() => this.updateRule("manualGroups", r.manualGroups.filter((_, i) => i !== index))}>Remove</button>
          </section>`)}</div><button type="button" ?disabled=${!canEdit} @click=${this.addGroup}>Add group</button></div>` : nothing}
          ${r.method === "existing" ? html`<label class="wide">Existing grouping<select .value=${r.existingGroupingId} ?disabled=${!canEdit} @change=${(e: Event) => this.text("existingGroupingId", e)}><option value="">Choose a grouping</option>${groupings.map(item => html`<option value=${item.id} ?selected=${r.existingGroupingId === item.id}>${item.name}</option>`)}</select></label>` : nothing}
          <label>Save groups in<select .value=${r.grouping} ?disabled=${!canEdit && !this.offline} @change=${(e: Event) => this.text("grouping", e)}><option value="new">Create a new grouping</option><option value="existing">Add to an existing grouping</option><option value="none">Do not use a grouping</option></select></label>
          ${r.grouping === "new" ? html`<label>Grouping name<input .value=${r.groupingName} ?disabled=${!canEdit && !this.offline} @input=${(e: Event) => this.text("groupingName", e)}></label>` : nothing}
          ${r.grouping === "existing" ? html`<label>Existing grouping<select .value=${r.groupingId} ?disabled=${!canEdit} @change=${(e: Event) => this.text("groupingId", e)}><option value="">Choose a grouping</option>${groupings.map(item => html`<option value=${item.id} ?selected=${r.groupingId === item.id}>${item.name}</option>`)}</select></label>` : nothing}
          <label class="check"><input type="checkbox" .checked=${r.messaging} ?disabled=${!canEdit && !this.offline} @change=${(e: Event) => this.check("messaging", e)}>Enable group messaging</label>
          ${r.method === "automatic" ? html`<label class="wide">Random seed<input .value=${r.seed} ?disabled=${!canEdit && !this.offline} @input=${(e: Event) => this.text("seed", e)}></label>` : nothing}
        </div>${this.preview ? html`<div class="preview" aria-live="polite"><strong>Preview</strong>${this.preview.map(group => html`<span>${group.name}: ${group.members.length} participant${group.members.length === 1 ? "" : "s"}</span>`)}</div>` : nothing}</form>
      </div><footer><button type="button" ?disabled=${!canEdit} @click=${this.makePreview}>Preview</button><button type="button" @click=${() => this.close(undefined)}>Cancel</button><button class="primary" type="submit" form="rules-form" ?disabled=${!canSave}>Save rules</button></footer></div>
    </dialog>`
  }
}

if(!customElements.get("widget-grouping-dialog")) customElements.define("widget-grouping-dialog", WidgetGroupingDialog)
