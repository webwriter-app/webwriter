import {css, html, nothing} from "lit"
import type {ProofreadingAction, ProofreadingState} from "../editor-bridge"

type Issue = ProofreadingState["issues"][number]
export const proofreadingKindLabels = {spelling: "Spelling", grammar: "Grammar", style: "Style"} as const

/** Shared by Review and the in-document popup, both outside authored content. */
export const proofreadingCardStyles = css`
  .proofreading-card {
    display: grid;
    gap: .35rem;
    min-width: 0;
    padding: .55rem;
    border: 1px solid #d5dce5;
    border-radius: .4rem;
    background: #fff;
    box-shadow: 0 1px 2px rgb(31 41 55 / 5%);
    font-family: system-ui, sans-serif;
  }
  .proofreading-card[data-hover-kind="spelling"] {border-color: #c62828; background: #fff6f6}
  .proofreading-card[data-hover-kind="grammar"] {border-color: #1769aa; background: #f3f8fd}
  .proofreading-card[data-hover-kind="style"] {border-color: #7b3fbb; background: #faf5ff}
  .proofreading-issue {
    display: grid;
    gap: .22rem;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    text-align: left;
    color: inherit;
    background: transparent;
  }
  button.proofreading-issue {cursor: pointer}
  button.proofreading-issue:hover:not(:disabled) .proofreading-text {color: #175a9e}
  .proofreading-kind {color: #64748b; font-size: .62rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase}
  .proofreading-message, .proofreading-text {min-width: 0; overflow-wrap: anywhere}
  .proofreading-message {font-size: .72rem; line-height: 1.35}
  .proofreading-text {font-size: .78rem; font-weight: 650}
  .proofreading-suggestions {display: flex; flex-wrap: wrap; gap: .35rem; min-width: 0}
  .proofreading-suggestion {
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
    padding: .3rem .5rem;
    border: 1px solid #b8d6f5;
    border-radius: .3rem;
    color: #154d80;
    background: #eff7ff;
    font: 600 .72rem/1.2 system-ui, sans-serif;
    cursor: pointer;
  }
  .proofreading-suggestion:hover:not(:disabled) {background: #e3efff}
  .proofreading-suggestion:active:not(:disabled) {background: #d3e5f8}
  .proofreading-actions {display: flex; align-items: center; justify-content: space-between; gap: .35rem; min-width: 0; margin-top: .15rem}
  .proofreading-action {
    padding: .25rem .35rem;
    border: 0;
    border-radius: .25rem;
    outline: none;
    color: #64748b;
    background: transparent;
    font: .68rem/1.2 system-ui, sans-serif;
    white-space: nowrap;
    cursor: pointer;
  }
  .proofreading-ignore {margin-inline-start: auto}
  .proofreading-action:hover:not(:disabled) {color: #243447; background: #e7eef5}
  .proofreading-action:active:not(:disabled) {color: #153b5c; background: #dbe7f2}
  .proofreading-card button:disabled {opacity: .5; cursor: default}
  .proofreading-card button:focus-visible {outline: 2px solid #3977c7; outline-offset: 2px}
  .proofreading-card .proofreading-action:focus-visible {outline: none; text-decoration: underline; text-underline-offset: .2em}
`

export function renderProofreadingCard(issue: Issue, onAction: (action: ProofreadingAction) => void,
  {disabled = false, hovered = false, popup = false}: {disabled?: boolean, hovered?: boolean, popup?: boolean} = {}) {
  const heading = html`<span class="proofreading-kind">${proofreadingKindLabels[issue.kind]}</span>
    <span class="proofreading-message">${issue.message}</span><span class="proofreading-text">${issue.text}</span>`
  return html`<article class="proofreading-card" data-hover-kind=${hovered ? issue.kind : nothing}>
    ${popup ? html`<div class="proofreading-issue">${heading}</div>` : html`<button class="proofreading-issue" type="button"
      ?disabled=${disabled} aria-label=${`Go to ${issue.kind} issue: ${issue.text}`}
      @click=${() => onAction({type: "selectProofreadingIssue", id: issue.id})}>${heading}</button>`}
    ${issue.suggestions.length ? html`<div class="proofreading-suggestions">${issue.suggestions.map((suggestion, index) => {
      const label = suggestion.kind === "remove" ? "Remove" : suggestion.kind === "insertAfter" ? `Add ${suggestion.text}` : suggestion.text
      return html`<button class="proofreading-suggestion" type="button" role=${popup ? "menuitem" : nothing}
        ?disabled=${disabled} aria-label=${`Apply suggestion: ${label}`}
        @click=${() => onAction({type: "applyProofreadingSuggestion", id: issue.id, index})}>${label}</button>`
    })}</div>` : nothing}
    <div class="proofreading-actions">
      ${issue.kind === "spelling" ? html`<button class="proofreading-action proofreading-add-word" type="button" role=${popup ? "menuitem" : nothing}
        ?disabled=${disabled} aria-label=${`Add ${issue.text} to local dictionary`}
        @click=${() => onAction({type: "addProofreadingWord", id: issue.id})}>Add to dictionary</button>` : nothing}
      <button class="proofreading-action proofreading-ignore" type="button" role=${popup ? "menuitem" : nothing}
        ?disabled=${disabled} @click=${() => onAction({type: "ignoreProofreadingIssue", id: issue.id})}>Ignore</button>
    </div>
  </article>`
}
