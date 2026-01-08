import { LitElement, html, css } from "lit";
import { customElement, property, query, queryAsync } from "lit/decorators.js";
import { localized, msg } from "@lit/localize";
import {
  SlChangeEvent,
  SlInput,
  getFormControls,
} from "@shoelace-style/shoelace";
import { DataInput } from "#view";
import {
  LLMAccount,
  PocketbaseAccount,
} from "#model";
import { filterObject } from "#utility";

@localized()
@customElement("ww-pocketbase-account-form")
export class PocketbaseAccountForm extends LitElement {
  static get defaults() {
    return {
      url: "https://node1.webwriter.elearn.rwth-aachen.de",
      email: "",
      password: "",
    };
  }

  @property({ type: String })
  url = PocketbaseAccountForm.defaults.url;

  @property({ type: String })
  email = PocketbaseAccountForm.defaults.email;

  @property({ type: String })
  password = PocketbaseAccountForm.defaults.password;

  @property({ type: Boolean, attribute: true })
  passwordUnchanged = false;

  @query("form")
  form: HTMLFormElement;

  @property({ attribute: false })
  defaultValue = PocketbaseAccountForm.defaults;

  @property({ type: Boolean, attribute: true })
  loading = false;

  @property({ type: Boolean, attribute: true })
  disabled = false;

  @property({ type: String, attribute: true })
  size: "small" | "medium" | "large" = "medium";

  static styles = css`
    form {
      display: flex;
      flex-direction: column;
      gap: var(--sl-spacing-small);
    }

    form footer {
      display: flex;
      flex-direction: row;
      justify-content: flex-end;
      gap: var(--sl-spacing-small);
    }
  `;

  checkValidity() {
    return this.elements.every((el) => el.checkValidity());
  }

  reportValidity() {
    return this.form.reportValidity();
  }

  handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (this.reportValidity()) {
      this.dispatchEvent(new Event("submit"));
    }
  };

  handleCancel = () => {
    this.dispatchEvent(
      new CustomEvent("ww-cancel", { composed: true, bubbles: true })
    );
    this.reset();
  };

  handleFieldChange = (e: SlChangeEvent) => {
    const element = e.target! as unknown as DataInput;
    (this as any)[element.name] = element.value;
    this.dispatchEvent(
      new CustomEvent("ww-change-field", {
        bubbles: true,
        composed: true,
        detail: { name: element.name, valid: element.checkValidity() },
      })
    );
  };

  reset() {
    Object.keys(PocketbaseAccountForm.defaults).forEach((key) => {
      (this as any)[key] = (this.defaultValue as any)[key];
    });
    this.requestUpdate();
  }

  get elements() {
    return getFormControls(this.form) as (Element & DataInput)[];
  }

  get value() {
    return Object.fromEntries(
      Object.keys(this.defaultValue).map((key) => {
        return [key, (this as any)[key]];
      })
    ) as typeof PocketbaseAccountForm.defaults;
  }

  set value(value: typeof PocketbaseAccountForm.defaults | undefined) {
    if (value === undefined) {
      this.value = PocketbaseAccountForm.defaults;
      return;
    }
    Object.keys(value).forEach((key) => {
      (this as any)[key] = (value as any)[key];
    });
  }

  get account() {
    const valueWithoutPassword = filterObject(
      this.value ?? {},
      (key) => key !== "password"
    ) as any;
    return this.value ? new PocketbaseAccount(valueWithoutPassword) : undefined;
  }

  async firstUpdated() {
    const input = await this.emailInput;
    input.focus();
  }

  @queryAsync("sl-input")
  emailInput: Promise<SlInput>;

  render() {
    return html`<form
      @sl-change=${this.handleFieldChange}
      ?inert=${this.loading}
      @submit=${this.handleSubmit}
    >
      <sl-input
        size=${this.size}
        label=${msg("Email")}
        type="email"
        name="email"
        value=${this.email}
        required
        ?disabled=${this.disabled}
      ></sl-input>
      <sl-input
        size=${this.size}
        label=${msg("Password")}
        type="password"
        name="password"
        value=${this.password}
        placeholder=${this.passwordUnchanged ? msg("-unchanged-") : ""}
        required
        ?disabled=${this.disabled}
      ></sl-input>
      <footer id="form-buttons">
        <slot name="footer">
          <ww-button outline variant="neutral" @click=${this.handleCancel}>
            ${msg("Cancel")}
          </ww-button>
          <ww-button variant="primary" type="submit" ?loading=${this.loading}>
            ${msg("Save")}
          </ww-button>
        </slot>
      </footer>
    </form>`;
  }
}

@localized()
@customElement("ww-llm-account-form")
export class LLMAccountForm extends LitElement {
  static get defaults() {
    return {
      company: "",
      model: "",
      apiKey: "",
    };
  }

  static llmData = {
    OpenAI: ["gpt-4o", "gpt-4o-mini"],
    Google: ["gemini-1.5-flash", "gemini-1.5-pro"],
    Anthropic: ["claude-3-haiku", "claude-3.5-sonnet"],
  };

  @query("form")
  form: HTMLFormElement;

  @property({ attribute: false })
  defaultValue = LLMAccountForm.defaults;

  @property({ type: Boolean, attribute: true })
  loading = false;

  @property({ type: String, attribute: true })
  size: "small" | "medium" | "large" = "medium";

  @property({ type: String })
  company = LLMAccountForm.defaults.company;

  @property({ type: String })
  model = LLMAccountForm.defaults.model;

  @property({ type: String })
  apiKey = LLMAccountForm.defaults.apiKey;

  static styles = css`
    form {
      display: flex;
      flex-direction: column;
      gap: var(--sl-spacing-small);
    }

    form footer {
      display: flex;
      flex-direction: row;
      justify-content: flex-end;
      gap: var(--sl-spacing-small);
    }
  `;

  checkValidity() {
    return this.elements.every((el) => el.checkValidity());
  }

  reportValidity() {
    return this.form.reportValidity();
  }

  handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (this.reportValidity()) {
      this.dispatchEvent(new Event("submit"));
    }
  };

  handleCancel = () => {
    this.dispatchEvent(
      new CustomEvent("ww-cancel", { composed: true, bubbles: true })
    );
    this.reset();
  };

  handleFieldChange = (e: SlChangeEvent) => {
    const element = e.target! as unknown as DataInput;
    (this as any)[element.name] = element.value;
    if (element.name === "company") {
      this.model = ""; // Reset model when company changes
    }
    this.dispatchEvent(
      new CustomEvent("ww-change-field", {
        bubbles: true,
        composed: true,
        detail: { name: element.name, valid: element.checkValidity() },
      })
    );
  };

  reset() {
    Object.keys(LLMAccountForm.defaults).forEach((key) => {
      (this as any)[key] = (this.defaultValue as any)[key];
    });
    this.requestUpdate();
  }

  get elements() {
    return getFormControls(this.form) as (Element & DataInput)[];
  }

  get value() {
    return {
      company: this.company,
      model: this.model,
      apiKey: this.apiKey,
    };
  }

  set value(value: typeof LLMAccountForm.defaults | undefined) {
    if (value === undefined) {
      this.value = LLMAccountForm.defaults;
      return;
    }
    Object.keys(value).forEach((key) => {
      (this as any)[key] = (value as any)[key];
    });
  }

  get account() {
    return this.value ? new LLMAccount(this.value) : undefined;
  }

  render() {
    return html`<form
      @sl-change=${this.handleFieldChange}
      ?inert=${this.loading}
      @submit=${this.handleSubmit}
    >
      <sl-select
        size=${this.size}
        label=${msg("Company")}
        name="company"
        value=${this.company}
        required
      >
        ${Object.keys(LLMAccountForm.llmData).map(
          (company) => html`<sl-option value=${company}>${company}</sl-option>`
        )}
      </sl-select>
      <sl-select
        size=${this.size}
        label=${msg("Model")}
        name="model"
        value=${this.model}
        required
        ?disabled=${!this.company}
      >
        ${this.company
          ? LLMAccountForm.llmData[
              this.company as keyof typeof LLMAccountForm.llmData
            ].map(
              (model) => html`<sl-option value=${model}>${model}</sl-option>`
            )
          : html`<sl-option value="" disabled selected
              >${msg("Select a company first")}</sl-option
            >`}
      </sl-select>
      <sl-input
        size=${this.size}
        label=${msg("API Key")}
        type="password"
        name="apiKey"
        value=${this.apiKey}
        required
      ></sl-input>
      <footer id="form-buttons">
        <slot name="footer">
          <ww-button outline variant="neutral" @click=${this.handleCancel}>
            ${msg("Cancel")}
          </ww-button>
          <ww-button
            variant="primary"
            type="submit"
            ?loading=${this.loading}
            @click=${this.handleSubmit}
          >
            ${msg("Save")}
          </ww-button>
        </slot>
      </footer>
    </form>`;
  }
}
