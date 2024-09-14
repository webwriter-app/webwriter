import { SchemaPlugin } from ".";
import { HTMLElementSpec, HTMLElementSpecPair } from "../htmlelementspec";

const formAttrs = {
  form: {default: undefined},
  formaction: {default: undefined},
  formenctype: {default: undefined},
  formmethod: {default: undefined},
  formnovalidate: {default: undefined},
  formtarget: {default: undefined},
}

export const formPlugin = () => ({
  nodes: {
    ...HTMLElementSpecPair({
      button: {
        tag: "button",
        content: "phrasing*",
        group: "flow interactive listed labelable submittable formassociated palpable inlinecontainer",
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
      },
      button_inline: {inline: true, group: "phrasing inlinecontainer"}
    }),
    ...HTMLElementSpecPair({
      input: HTMLElementSpec({
        tag: "input",
        group: "flow listed submittable resettable formassociated labelable palpable",
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
      input_inline: {inline: true, group: "phrasing"}
    }),
    ...HTMLElementSpecPair({
      textarea: HTMLElementSpec({
        tag: "textarea",
        group: "flow listed submittable resettable formassociated labelable palpable",
        attrs: {
          autocapitalize: {default: undefined},
          autocomplete: {default: undefined},
          autofocus: {default: undefined},
          cols: {default: undefined},
          dirname: {default: undefined},
          disabled: {default: undefined},
          ...formAttrs,
          maxlength: {default: undefined},
          minlength: {default: undefined},
          name: {default: undefined},
          placeholder: {default: undefined},
          readonly: {default: undefined},
          required: {default: undefined},
          rows: {default: undefined},
          spellcheck: {default: undefined},
          wrap: {default: undefined}
        }
      }),
      textarea_inline: {inline: true, group: "phrasing"}
    }),
    ...HTMLElementSpecPair({
      select: {
        tag: "select",
        group: "flow interactive listed labelable resettable submittable formassociated",
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
      },
      select_inline: {inline: true, group: "phrasing"}
    }),
    ...HTMLElementSpecPair({
      meter: {
        tag: "meter",
        group: "flow labelable palpable",
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
      },
      meter_inline: {inline: true, group: "phrasing inlinecontainer"}
    }),
    ...HTMLElementSpecPair({
      datalist: {
        tag: "datalist",
        group: "flow",
        content: "option*", // phrasing*
        contentKind: "inline"
      },
      datalist_inline: {inline: true, group: "phrasing inlinecontainer"}
    }),
    fieldset: HTMLElementSpec({
      tag: "fieldset",
      group: "flow sectioning listed formassociated palpable containerblock",
      content: `flow*`, // mixed // legend?
      contentKind: "block",
      attrs: {
        disabled: {default: undefined},
        form: {default: undefined},
        name: {default: undefined},
      }
    }),
    form: HTMLElementSpec({
      tag: "form",
      group: "flow palpable containerblock",
      content: "flow*", // mixed
      contentKind: "block",
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
    ...HTMLElementSpecPair({
      label: {
        tag: "label",
        group: "flow interactive formassociated palpable",
        content: "phrasing*",
        contentKind: "inline",
        attrs: {
          for: {default: undefined}
        }
      },
      label_inline: {inline: true, group: "phrasing inlinecontainer"}
    }),
    legend: HTMLElementSpec({
      tag: "legend",
      group: "containerinline",
      content: "(heading)*", // mixed
      contentKind: "block"
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
      group: "containerinline",
      content: "text?",
      attrs: {
        disabled: {default: undefined},
        label: {default: undefined},
        selected: {default: undefined},
        value: {default: undefined},
      }
    }),
    ...HTMLElementSpecPair({
      output: {
        tag: "output",
        group: "flow listed labelable resettable formassociated palpable containerinline",
        content: "phrasing*",
        attrs: {
          for: {default: undefined},
          form: {default: undefined},
          name: {default: undefined},
        }
      },
      output_inline: {inline: true, group: "phrasing inlinecontainer"}
    }),
    ...HTMLElementSpecPair({
      progress: {
        tag: "progress",
        group: "flow labelable palpable containerinline",
        content: "phrasing*",
        attrs: {
          max: {default: undefined},
          value: {default: undefined}
        }
      },
      progress_inline: {inline: true, group: "phrasing inlinecontainer"}
    }),
  }
} as SchemaPlugin)