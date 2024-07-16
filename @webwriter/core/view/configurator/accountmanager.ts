import { LitElement, html, css } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"

import { Command, StoreController } from "../../viewmodel"
import { capitalizeWord, groupBy, sameMembers } from "../../utility"
import { classMap } from "lit/directives/class-map.js"
import { styleMap } from "lit/directives/style-map.js"
import { ifDefined } from "lit/directives/if-defined.js"
import { Account, AccountTypeId } from "../../model/stores/accountstore"
import { NpmAccountForm, PocketbaseAccountForm } from "./accountform"
import { APPICON, App, Button, Settings } from ".."
import { FileAccount, NpmAccount, PocketbaseAccount } from "../../model/schemas/accounts"
import { SlCard, SlInput } from "@shoelace-style/shoelace"
import { ClientResponseError } from "pocketbase"
import { toJS } from "mobx"
import { PocketbaseClient } from "../../model"

@localized()
@customElement("ww-account-manager")
export class AccountManager extends LitElement {

  @property({attribute: false})
  app: Settings

  static get icons() { return {
    "file": "signature",
    "pocketbase": "webwriter-app-icon",
    "npm": "brand-npm"
  } as const}

  static get labels() { return {
    "file": "Signature",
    "pocketbase": "WebWriter Cloud",
    "npm": "Package Registry"
  } as const}

  static get descriptions() { return {
    "file": msg("This information about you is automatically added to new documents. You can change this for each document in the metadata editor."),
    "pocketbase": msg("WebWriter Cloud accounts allow you store documents online and share them with your students. Add an account here and it will be available as a location for saving, loading, sharing and opening documents."),
    "npm": msg("Package registry accounts are intended for developers and allow you to configure one or more registries")
  } as const}

  static styles = css`

    :host {
      display: flex;
      flex-direction: column;
      gap: 3rem;
      color: var(--sl-color-gray-800);

      & .accounts-pane {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;

        & h2 {
          width: 400px;
          display: flex;
          flex-direction: row;
          align-items: center;
          font-size: 1rem;
          margin: 0;
          gap: 1ch;

          & .icon {
            width: 32px;
            height: 32px;
          }

          & .help {
            margin-left: auto;
            width: 24px;
            height: 24px;
          }
        }

        & .accounts-list {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          scrollbar-width: thin;
          
          & .add-button {
            width: 400px;
          }

          & .account-card {
            width: 400px;

            & .account-header {
              display: flex;
              flex-direction: row;
              align-items: center;

              & .account-label {
                flex-grow: 1;
              }
            }

            &::part(body) {
              display: flex;
              flex-direction: column;
              gap: 0.5rem;
            }

            & sl-input {
              &::part(form-control) {
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 1ch;
              }

              &::part(form-control-label) {
                width: 8ch;
              }

              &::part(form-control-input) {
                flex-grow: 1;
              }

            }
          }
        }
      }
    }
  `

  accountCards = {
    "file": (account?: FileAccount) => {
      return html`<sl-card class="account-card">
        <sl-input size="small" placeholder=${msg("None")} label=${msg("Name")} value=${ifDefined(account?.name)} @sl-change=${(e: any) => this.handleFileAccountChange("name", e.target.value)}></sl-input>
        <sl-input size="small" placeholder=${msg("None")} label=${msg("Email")} type="email" value=${ifDefined(account?.email)} @sl-change=${(e: any) => this.handleFileAccountChange("email", e.target.value)}></sl-input>
      </sl-card>`
    },
    "pocketbase": (account?: PocketbaseAccount) => {
      const pending = !account
      const isSignedIn = Boolean(account && (this.app.store.accounts.getClient("pocketbase", account.id) as PocketbaseClient)?.isSignedIn)
      return html`<sl-card class=${classMap({"pending-account-card": pending, "account-card": true})} class="account-card">
        ${this.AccountHeader(account)}
        <ww-pocketbase-account-form
          class="account-form"
          size="small"
          @ww-cancel=${this.handleCancel}
          @submit=${this.handleSubmit}
          @ww-change-field=${(e: any) => this.handleChangeField(e, "pocketbase")}
          .value=${account}
          ?disabled=${isSignedIn}
          ?passwordunchanged=${!pending && isSignedIn}
        >
          ${account? undefined: html`
            <ww-button
              slot="footer"
              outline 
              variant="neutral"
              @click=${this.handleCancel}>
              ${msg("Cancel")}
            </ww-button>  
          `}
          ${!isSignedIn || !account? undefined: html`
            <ww-button
              slot="footer"
              outline 
              variant="neutral"
              @click=${() => this.handleSignout("pocketbase", account.id!)}>
              ${msg("Sign out")}
            </ww-button>  
          `}
          ${isSignedIn && account? undefined: html`
            <ww-button
              class="submit-button"
              slot="footer"
              variant="primary"
              type="submit"
              @click=${this.handleSubmit}>
              ${msg("Sign in")}
            </ww-button>
          `}
        </ww-pocketbase-account-form>
      </sl-card>`
    },
    "npm": (account?: NpmAccount) => {
      const pending = !account
      return html`<sl-card class=${classMap({"pending-account-card": pending, "account-card": true})} class="account-card">
        ${this.AccountHeader(account)}
        <ww-npm-account-form
          class="account-form"
          size="small"
          @ww-cancel=${this.handleCancel}
          @submit=${this.handleSubmit}
          .value=${account}
        ></ww-npm-account-form>
      </sl-card>`
    }
  }

  AccountHeader<T extends AccountTypeId>(account?: Account<T>) {
    return html`<div class="account-header" slot="header">
      <b class="account-label">${account?.id}</b>
      <sl-icon-button name="x" title=${!account? msg("Cancel"): msg("Remove this account")} @click=${() => !account? this.handleCancel(): this.handleRemove(account)}></sl-icon-button>
    </div>`
  }

  AccountsPane<T extends AccountTypeId>(type: T, accounts: Record<string, Account<T>>) {
    const icon = AccountManager.icons[type] !== "webwriter-app-icon"
      ? AccountManager.icons[type]
      : undefined
    const src = AccountManager.icons[type] === "webwriter-app-icon"
      ? APPICON
      : undefined 
    const label = AccountManager.labels[type]
    const description = AccountManager.descriptions[type]
    return html`<div class="accounts-pane">
      <h2>
        <sl-icon class="icon" name=${ifDefined(icon)} src=${ifDefined(src)}></sl-icon>
        ${label}
        <sl-tooltip content=${description}>
          <sl-icon name="help" class="help"></sl-icon>
        </sl-tooltip>
      </h2>
      <div class="accounts-list">
        ${Object.values(accounts).map(account => this.accountCards[type](account as any))}
        ${type === "file"? undefined: html`
          ${this.pendingAccount?.type === type? html`
            ${this.accountCards[type]()}
          `: html`
            <ww-button @click=${() => this.handleClickAdd(type)} class="add-button" icon="plus"></ww-button>  
          `}
        `}
      </div>
    </div>`
  }

  async handleFileAccountChange(key: string, value: string) {
    const fileAccount = this.app.store.accounts.getAccount("file")
    const newAccount = new FileAccount({...fileAccount, [key]: value} as any)
    this.app.store.accounts.updateAccount(newAccount)
    await this.app.settings.persist()
  }

  handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()
    const el = (e.target as HTMLElement).parentElement!
    const form = (el.classList.contains("account-form")? el: el.querySelector(".account-form")) as PocketbaseAccountForm | NpmAccountForm
    const submitButton = form.parentElement!.querySelector(".submit-button") as Button
    const pending = form.parentElement!.classList.contains("pending-account-card")
    if(!form.checkValidity()) {
      form.reportValidity()
      return
    }
    const accounts = this.app.store.accounts
    const newAccount = form.account
    if(newAccount) {
      submitButton.loading = true
      accounts.addAccount(newAccount)
      const client = accounts.getClient("pocketbase", newAccount.id) as PocketbaseClient
      try {
        await client.signIn({password: (form as any).password, updateAccount: true})
        await this.app.settings.persist()
        if(pending) {
          this.pendingAccount = undefined
        }
        this.requestUpdate()
      }
      catch(error) {
        if(error instanceof ClientResponseError) {
          if(error.status === 400) {
            alert(msg("Invalid email or password"))
            accounts.removeAccount("pocketbase", newAccount.id)
          } 
        }
        else throw error
      }
      finally {
        submitButton.loading = false
      }
    }
  }

  async handleRemove(account: Account) {
    this.app.store.accounts.removeAccount(account, account.id)
    await this.app.settings.persist()
    this.requestUpdate()
  }

  handleCancel = () => {
    this.pendingAccount = undefined
  }

  handleSignout = (type: AccountTypeId, label: string) => {
    const client = this.app.store.accounts.getClient(type, label)
    if(client instanceof PocketbaseClient) {
      client.signOut(true)
      this.requestUpdate()
    }
  }

  handleClickAdd = (type: AccountTypeId) => {
    this.pendingAccount = {type}
  }

  handleChangeField = (e: CustomEvent, type: AccountTypeId) => {

  }

  @query(".pending-account-card")
  pendingAccountCard: SlCard

  @query(".pending-account-card .account-form")
  pendingAccountForm: PocketbaseAccountForm | NpmAccountForm

  @query(".pending-account-card .label-input")
  pendingAccountLabelInput: SlInput

  @property({state: true, attribute: false})
  pendingAccount: {type: AccountTypeId, [k: string]: any} | undefined

  render() {
    const accounts = this.app.store.accounts.accounts
    const types = Object.keys(accounts).filter(k => k === "pocketbase") as AccountTypeId[]
    return html`
      ${types.map(t => this.AccountsPane(t, accounts[t]))}
    `
  }
}