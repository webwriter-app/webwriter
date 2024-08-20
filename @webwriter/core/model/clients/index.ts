import { DialogFilter } from "@tauri-apps/api/dialog"
import { getFileExtension } from "../../utility"
import { Environment } from "../environment"
import { Account, FileAccount, NpmAccount, PocketbaseAccount } from "../schemas/accounts"
import PocketBase, { AsyncAuthStore, AuthModel, BaseAuthStore, BaseModel, CollectionModel, RecordModel, SerializeOptions } from "pocketbase"
import { EditorStateWithHead, Package, Resource, defaultConfig } from "../schemas"
import marshal from "../marshal"
import { Schema } from "prosemirror-model"

const BINARY_EXTENSIONS = Object.entries(marshal).flatMap(([k, v]) => v.isBinary? v.extensions: [])
const ALL_FILTER = {name: "Explorable", extensions: Object.values(marshal).flatMap(v => v.extensions)}
export const INDIVIDUAL_FILTERS = Object.entries(marshal).map(([k, v]) => ({name: "Explorable", extensions: v.extensions as unknown as string[]}))
const FILTERS = [ALL_FILTER, ...INDIVIDUAL_FILTERS]

const SAVE_FILTERS = [
  ...Object.entries(marshal)
    .filter(([k, v]) => !v.isParseOnly)
    .map(([k, v]) => ({name: "Explorable", extensions: v.extensions as unknown as string[]}))
]
const LOAD_FILTERS = [
  {name: "Explorable", extensions: Object.values(marshal).flatMap(v => v.extensions)},
  ...Object.entries(marshal)
    .map(([k, v]) => ({name: "Explorable", extensions: v.extensions as unknown as string[]}))
]

type FileFormat = keyof typeof marshal

export interface Client {
  readonly account: Account
  readonly Environment: Environment
}

export interface DocumentClient extends Client {
  /** Whether a given URL could be serviced by this client (same origin and username).*/
  isClientURL(url: URL): boolean
  /** Save a document `doc` in the given `format` at the given `url`. If no `url` is provided, let the configured storage handle the specific location. If no format is provided, assume `html`. Returns the URL of the saved document. */
  saveDocument(doc: string | Uint8Array, url?: URL | string, filename?: string): Promise<URL | undefined>
  /** Load a document from the given `url` in the configured storage. If no `url` is provided, let the configured storage handle the specific location.*/
  loadDocument(url?: URL | string): Promise<string | Uint8Array | undefined>
  /** Delete a document at the given URL. */
  deleteDocument?(url: string | URL): Promise<boolean>
  /** Search the documents of configured storage. If no `options` are provided, return all documents. */
  searchDocuments?(options: {page?: number, perPage?: number, sort?: string, filter?: string, expand?: string, fields?: string, skipTotal?: boolean}): Promise<URL[]>
  /** Pick a location for saving in the configured storage. Returns the location as a URL. */
  pickSave?(): Promise<URL | undefined>
  /** Pick a document from the configured storage. Returns the location as a URL. */
  pickLoad?(): Promise<URL | undefined>
  /** Get the public URL of the given document. */
  getSharingURLForDocument?(url: string | URL): Promise<URL>
}

export interface PackageClient extends Client {
  /** Search the packages of the configured registry. Returns an array of packages. */
  searchPackages(text: string, params?: {size?: number, quality?: number, popularity?: number, maintenance?: number}): Promise<Package[]>
  /** Publish a local package at `path` to the configured registry. Returns the URL of the published package if successful. */
  publishPackage?(path: string): Promise<string>
  /** Remove a local package at `path` from the configured registry. */
  unpublishPackage?(path: string): Promise<void>
}

export interface AnalyticsClient extends Client {
  pushStatements(): void
}

export interface AuthenticationClient extends Client {
  /** Log in to the configured service with the configured credentials. */
  signIn(options?: {password?: string, cookie?: string, updateAccount?: boolean}): Promise<void>
  /** Log out of the configured service. */
  signOut(): Promise<void>
  /** Return true if the service thinks it is still logged in (e.g. has an unexpired token). */
  get isSignedIn(): boolean
}

// @ts-ignore: Fix account types
export class FileClient implements DocumentClient {
  constructor(readonly account: FileAccount, readonly Environment: Environment) {}

  async saveDocument(doc: string | Uint8Array, url?: string | URL, title?: string) {
    const {OS, FS} = this.Environment
    const binary = doc instanceof Uint8Array
    const urlObj = url? new URL(url): await this.pickSave(undefined, title)
    if(!urlObj) {
      return
    }
    let path = decodeURI(urlObj.pathname).slice(1)
    path = ["darwin", "linux"].includes(await OS.platform())? "/" + path: path
    await FS.writeFile(path, doc, binary? "binary": "utf8")
    return urlObj
  }

  async loadDocument(url?: string | URL, binary=false) {
    const {OS, FS} = this.Environment
    const urlObj = url? new URL(url): await this.pickLoad()
    if(!urlObj) {
      return
    }
    let path = decodeURI(urlObj.pathname).slice(1)
    path = ["darwin", "linux"].includes(await OS.platform())? "/" + path: path
    let data = await FS.readFile(path, binary? "binary": "utf8")
    return data
  }

  async pickSave(filters: DialogFilter[]=SAVE_FILTERS, defaultPath?: string) {
    const path = await this.Environment.Dialog.promptWrite({filters, defaultPath}) as null | string ?? undefined
    return path? new URL(path, "file://"): undefined
  }

  async pickLoad(filters: DialogFilter[]=LOAD_FILTERS) {
    const path = await this.Environment.Dialog.promptRead({filters}) as null | string ?? undefined
    return path? new URL(path, "file://"): undefined

  }

  isClientURL(url: URL) {
    return url.protocol === "file:"
  }
}

export class NpmClient implements PackageClient, AuthenticationClient {
  constructor(readonly account: NpmAccount, readonly Environment: Environment) {}

  get isSignedIn(): boolean {
    // TODO: Check if token is present
    return false
  }

  async signIn() {
    // TODO: Configure the package manager to use this registry
    
  }

  async signOut() {
    // TODO: If using this registry, clear it
  }

  async searchPackages(text: string, params?: {size?: number, quality?: number, popularity?: number, maintenance?: number}) {
    const {objects} = await this.Environment.search(text, params)
    return objects.map(({package: pkg}) => new Package(pkg))
  }

  // Not supported by Bun yet
  /*
  async publishPackage(path: string) {

  }

  async unpublishPackage(path: string) {

  }*/


}

class PocketbaseAuthStore extends BaseAuthStore {
 constructor(readonly account: PocketbaseAccount, readonly onChangeAccount?: (account: PocketbaseAccount) => Promise<void>) {super()}

 get token(): string {
   return this.account.token ?? ""
 }

 get model(): AuthModel | null {
  return this.account.model ?? null
 }

 save(token: string, model?: AuthModel): void {
  if(token) {
    const newAccount = new PocketbaseAccount({...this.account, token, model: model as any})
    this.onChangeAccount && this.onChangeAccount(newAccount)
  }
 }

 clear(): void {
  const newAccount = new PocketbaseAccount({...this.account, token: undefined, model: undefined})
  this.onChangeAccount && this.onChangeAccount(newAccount)
 }

 
}

export class PocketbaseClient implements DocumentClient, AuthenticationClient {

  #pocketbase: PocketBase

  constructor(readonly account: PocketbaseAccount, readonly Environment: Environment, onChangeAccount?: (account: PocketbaseAccount) => Promise<void>) {
    this.#pocketbase = new PocketBase(account.url, new PocketbaseAuthStore(account, onChangeAccount))
  }

  async signIn(options?: {password?: string, cookie?: string, updateAccount?: boolean}) {
    if(this.isSignedIn) {
      return
    }
    if(options?.password) {
      const authModel = await this.#pocketbase.collection("users").authWithPassword(this.account.email, options.password)
      if(options.updateAccount) {
        this.account.token = authModel.token
      }
    }
    else if(options?.cookie) {
      return this.#pocketbase.authStore.loadFromCookie(options.cookie)
    }
  }
  
  async signOut(updateAccount=false) {
    this.#pocketbase.authStore.clear()
    if(updateAccount) {
      this.account.token = undefined
    }
  }

  get isSignedIn() {
    const authStore = this.#pocketbase.authStore
    return (authStore.isAuthRecord || authStore.isAdmin) && authStore.isValid
  }

  private recordModelToURL(model: RecordModel) {
    const url = new URL(this.#pocketbase.buildUrl(`/api/collections/${model.collectionName}/records/${model.id}`))
    url.username = this.account.email
    url.searchParams.set("created", model.created)
    url.searchParams.set("updated", model.updated)
    url.searchParams.set("filename", model.file)
    url.searchParams.set("mediatype", "text/html")
    url.searchParams.set("apitype", "pocketbase")
    return url
  }

  private idFromURL(url: string | URL) {
    return new URL(url).pathname.split("/").at(-1)
  }

  private filenameFromURL(url: string | URL) {
    return new URL(url).searchParams.get("filename") ?? undefined
  }

  isClientURL(url: URL) {
    const originMatches = new URL(this.account.url).origin === url.origin
    const usernameMatches = this.account.id === decodeURIComponent(url.username)
    return originMatches && usernameMatches
  }

  async searchDocuments(options: {page?: number, perPage?: number, sort?: string, filter?: string, expand?: string, fields?: string, skipTotal?: boolean}) {
    await this.signIn({cookie: this.account.token})
    const docs = this.#pocketbase.collection("documents")
    const results = await docs.getList(options.page, options.perPage, options)
    return results.items.map(item => this.recordModelToURL(item))
  }

  async saveDocument(doc: string | Uint8Array, url?: string | URL, filename?: string) {
    const resolvedFilename = filename || (url? new URL(url).searchParams.get("filename")?.replace(/\_\w{10}\.(\w+)/, ".$1") || "": "")
    await this.signIn({cookie: this.account.token})
    const docs = this.#pocketbase.collection("documents")
    const formData = new FormData()
    formData.append("owner", this.#pocketbase.authStore.model!.id)
    if(url) {
      const urlObj = new URL(url)
      const id = urlObj.pathname.split("/").at(-1)!
      const toUpdate = await this.#pocketbase.collection("documents").getOne(id)
      const toUpdateFilename = toUpdate.file.replace(/\_\w{10}\.(\w+)/, ".$1")
      const file = new File([doc], toUpdateFilename)
      formData.append("file", file)
      const updated = await this.#pocketbase.collection("documents").update(id, formData)
      return this.recordModelToURL(updated)
    }
    else {
      const file = new File([doc], resolvedFilename)
      formData.append("file", file)
      const model = await docs.create(formData)
      return this.recordModelToURL(model)
    }
  }

  async loadDocument(url?: string | URL) {
    await this.signIn({cookie: this.account.token})
    if(!url) {
      return undefined
    }
    const id = this.idFromURL(url)!
    const filename = this.filenameFromURL(url)!
    const record = await this.#pocketbase.collection("documents").getOne(id)
    const fileURL = this.#pocketbase.files.getUrl(record, filename)
    const response = await fetch(fileURL)
    const blob = await response.blob()
    const content = await blob.text()
    return content
  }

  async deleteDocument(url: string | URL) {
    await this.signIn({cookie: this.account.token})
    const id = this.idFromURL(url)
    return this.#pocketbase.collection("documents").delete(id!)
  }

  
  async getSharingURLForDocument(url: string | URL) {
    const id = this.idFromURL(url)! 
    return new URL(`/explorables/${id}`, this.#pocketbase.baseUrl)
  }
}

export default {
  file: FileClient,
  pocketbase: PocketbaseClient,
  npm: NpmClient
}