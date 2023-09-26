import { SchemaPlugin } from ".";
import { HTMLElementSpec } from "../htmlelementspec";

const formAttrs = {
  form: {default: undefined},
  formaction: {default: undefined},
  formenctype: {default: undefined},
  formmethod: {default: undefined},
  formnovalidate: {default: undefined},
  formtarget: {default: undefined},
}

export const formPlugin = () => ({
  button: HTMLElementSpec({
    tag: "button",
    group: "flow phrasing interactive listed labelable submittable formassociated palpable",
    attrs: {
      autofocus: {default: undefined},
      disabled: {default: undefined},
      ...formAttrs,
      name: {default: undefined},
      popovertarget: {default: undefined},
      popovertargetaction: {default: undefined},
      type: {default: undefined},
      value: {default: undefined},
    }
  }),
  input: HTMLElementSpec({
    tag: "input",
    group: "flow phrasing listed submittable resettable formassociated labelable palpable",
    attrs: {
      accept: {default: undefined},
      alt: {default: undefined},
      autocomplete: {default: undefined},
      capture: {default: undefined},
      checked: {default: undefined},
      dirname: {default: undefined},
      disabled: {default: undefined},
      ...formAttrs,
      height: {default: undefined},
      list: {default: undefined},
      max: {default: undefined},
      maxlength: {default: undefined},
      min: {default: undefined},
      minlength: {default: undefined},
      multiple: {default: undefined},
      name: {default: undefined},
      pattern: {default: undefined},
      placeholder: {default: undefined},
      popovertarget: {default: undefined},
      popovertargetaction: {default: undefined},
      readonly: {default: undefined},
      required: {default: undefined},
      size: {default: undefined},
      src: {default: undefined},
      step: {default: undefined},
      type: {default: undefined},
      value: {default: undefined},
      width: {default: undefined},
    }
  }),
  select: HTMLElementSpec({
    tag: "select",
    group: "flow phrasing interactive listed labelable resettable submittable formassociated",
    attrs: {
      autocomplete: {default: undefined},
      autofocus: {default: undefined},
      disabled: {default: undefined},
      form: {default: undefined},
      multiple: {default: undefined},
      name: {default: undefined},
      required: {default: undefined},
      size: {default: undefined}
    }
  }),
  meter: HTMLElementSpec({
    tag: "meter",
    group: "flow phrasing labelable palpable",
    inline: true,
    content: "phrasing*",
    attrs: {
      value: {default: undefined},
      min: {default: undefined},
      max: {default: undefined},
      low: {default: undefined},
      high: {default: undefined},
      optimum: {default: undefined},
      form: {default: undefined}
    }
  }),
  datalist: HTMLElementSpec({
    tag: "datalist",
    group: "flow phrasing",
    inline: true,
    content: "phrasing* | option*"
  }),
  fieldset: HTMLElementSpec({
    tag: "fieldset",
    group: "flow sectioning listed formassociated palpable",
    content: `legend? flow*`,
    attrs: {
      disabled: {default: undefined},
      form: {default: undefined},
      name: {default: undefined},
    }
  }),
  form: HTMLElementSpec({
    tag: "form",
    group: "flow palpable",
    content: "flow*",
    attrs: {
      "accept-charset": {default: undefined},
      autocomplete: {default: undefined},
      name: {default: undefined},
      rel: {default: undefined},
      action: {default: undefined},
      enctype: {default: undefined},
      method: {default: undefined},
      novalidate: {default: undefined},
      target: {default: undefined}
    }
  }),
  label: HTMLElementSpec({
    tag: "label",
    group: "flow phrasing interactive formassociated palpable",
    inline: true,
    content: "phrasing*",
    attrs: {
      for: {default: undefined}
    }
  }),
  legend: HTMLElementSpec({
    tag: "legend",
    content: "(phrasing | heading)*"
  }),
  optgroup: HTMLElementSpec({
    tag: "optgroup",
    content: "option*",
    attrs: {
      disabled: {default: undefined},
      label: {default: undefined}
    }
  }),
  option: HTMLElementSpec({
    tag: "option",
    content: "text?",
    attrs: {
      disabled: {default: undefined},
      label: {default: undefined},
      selected: {default: undefined},
      value: {default: undefined},
    }
  }),
  output: HTMLElementSpec({
    tag: "output",
    group: "flow phrasing listed labelable resettable formassociated palpable",
    content: "phrasing*",
    attrs: {
      for: {default: undefined},
      form: {default: undefined},
      name: {default: undefined},
    }
  }),
  progress: HTMLElementSpec({
    tag: "progress",
    group: "flow phrasing labelable palpable",
    content: "phrasing*",
    attrs: {
      max: {default: undefined},
      value: {default: undefined}
    }
  })
} as SchemaPlugin)