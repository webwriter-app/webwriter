import {css} from "lit"

export const widgetOptionControlStyles = /* @__PURE__ */ css`
  .widget-options {
    display: grid;
    gap: 0.45rem;
    min-width: 12rem;
  }

  .widget-options .widget-option-field :is(input:not([type="checkbox"], [type="radio"], [type="range"]), textarea) {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    padding: .2rem;
    border: var(--editor-control-border-width, .5px) solid #c5ccd5;
    border-radius: 4px;
    color: #2f3742;
    background: transparent;
    font: inherit;
    font-size: .68rem;
  }
  .widget-options .widget-option-field input:not([type="checkbox"], [type="radio"], [type="range"]) {
    height: 1.7rem;
    min-height: 1.7rem;
  }
  .widget-options .widget-option-field :is(input, textarea):focus-visible {
    border-color: #c5ccd5;
    outline: 2px solid #b9d7f5;
    outline-offset: 0;
  }
  .widget-options .widget-option-field :is(input, textarea):invalid {border-color: #c2413a;}
  .widget-options :is(input, textarea):disabled {opacity: .55; cursor: default;}
  .widget-options input:is([type="checkbox"], [type="radio"]) {accent-color: #3977c7;}
  .widget-options input.editor-switch {--switch-width: 1.9rem; --switch-height: 1.05rem;}

  .develop-field.widget-option-checkbox {
    flex-direction: row;
    align-items: center;
    gap: 0.35rem;
  }

  .widget-option-group, .widget-option-group-fields {
    display: grid;
    gap: 0.45rem;
    min-width: 0;
  }

  .widget-option-group {
    border-top: 1px solid #dce3ec;
    padding-top: 0.45rem;
    font-size: 0.7rem;
    color: #526b86;
  }

  .widget-option-group > details > summary { cursor: pointer; font-weight: 600; }
  .widget-option-group > details[open] > summary { margin-bottom: 0.45rem; }
  .widget-option-group p { margin: 0; }
  .widget-option-value { display: flex; align-items: center; gap: 0.35rem; min-width: 0; }
  .widget-option-value > style-combobox {flex: 1; min-width: 0;}
  .widget-option-value > ribbon-combobox {flex: 0 0 auto;}
  .widget-option-value:has(> .widget-option-unit):not(:has(input[type="range"])) {gap: 0;}
  .widget-option-value:has(> .widget-option-unit) > input {border-top-right-radius: 0; border-bottom-right-radius: 0;}
  .widget-option-value > .widget-option-unit {display: flex; align-items: center; align-self: stretch; padding: 0 .3rem; border: var(--editor-control-border-width, .5px) solid #c5ccd5; border-left: 0; border-radius: 0 4px 4px 0; font-size: .55rem;}
  .widget-option-value:has(input[type="range"]) > .widget-option-unit {border: 0; padding: 0;}
  .widget-option-value input[type="range"] {width: 100%; min-width: 0; height: 1.2rem; min-height: 0; padding: 0; border: 0; box-shadow: none; background: transparent; accent-color: #3977c7;}
  .widget-option-value > input, .widget-option-value > select, .widget-option-value > textarea { flex: 1; min-width: 0; }
  .widget-option-value output, .widget-option-unit { flex: 0 0 auto; }
  .widget-option-field > .develop-field-help { grid-column: 1 / -1; }
  .widget-option-tree { min-width: 0; overflow-wrap: anywhere; }
  .widget-option-tree ul { list-style: none; padding: 0; padding-inline-start: 0.8rem; margin: 0.25rem 0 0; }
  .widget-option-tree li { margin: 0.25rem 0; }
  .widget-option-tree label { display: inline-flex; align-items: flex-start; gap: 0.3rem; max-width: 100%; }
  .widget-option-tree input { flex: 0 0 auto; margin: .05rem 0 0; }
  .widget-option-tree :is(summary, li > label) { box-sizing: border-box; padding-inline-start: 0.8rem; }
  .widget-option-tree summary {cursor: pointer; list-style-position: outside;}
  .widget-option-tree summary > label {vertical-align: top;}
  .widget-option-unit { color: #526b86; font-size: 0.65rem; }
  .widget-option-radios { display: grid; gap: 0.3rem; }
  .widget-option-radios label { display: flex; align-items: center; gap: 0.3rem; }
  .widget-option-segmented button {min-height: 1.7rem; padding: .15rem .2rem; font: .68rem/1.2 system-ui, sans-serif; overflow-wrap: anywhere;}
  .widget-option-segmented button:disabled {opacity: .55; cursor: default;}
  .widget-action-item { display: grid; gap: 0.2rem; min-width: 0; }
  .widget-action-error { color: #b0342c; font-size: 0.65rem; overflow-wrap: anywhere; }
  .widget-action[data-intent="danger"] {--ribbon-control-color: #a72c25;}
  .widget-actions {display: grid; gap: .3rem; min-width: 0;}
  .choice-group.widget-action-group {
    display: flex;
    flex-wrap: wrap;
    background: #c5ccd5;
    --widget-action-border-width: 0;
    --widget-action-border-radius: 0;
  }
  .widget-action-group > .widget-action-item {flex: 1 1 5rem; background: #f7f7f7;}
  .widget-action-group > .widget-action-item > :is(.develop-field-help, .widget-action-error) {padding: 0 .3rem .2rem;}

`
