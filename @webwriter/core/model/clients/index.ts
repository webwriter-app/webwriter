import { DialogFilter } from "@tauri-apps/api/dialog";
import { getFileExtension } from "../../utility";
import { Environment } from "../environment";
import {
  Account,
  FileAccount,
  LLMAccount,
  NpmAccount,
  PocketbaseAccount,
} from "../schemas/accounts";
import PocketBase, {
  AsyncAuthStore,
  AuthModel,
  BaseAuthStore,
  BaseModel,
  CollectionModel,
  RecordModel,
  SerializeOptions,
} from "pocketbase";
import {
  EditorStateWithHead,
  Package,
  Resource,
  defaultConfig,
} from "../schemas";
import marshal from "../marshal";
import { Schema } from "prosemirror-model";
import { toJS } from "mobx";

function writeFileDownload(uri: string, name?: string) {
  const a = document.createElement("a");
  name && a.setAttribute("download", name);
  a.style.display = "none";
  a.href = uri;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function readFileInput() {
  return new Promise<string | Uint8Array | undefined>(
    async (resolve, reject) => {
      let file: File;
      try {
        file = await pickFileInput();
      } catch (err) {
        return reject(new Error("User cancelled"));
      }
      const reader = new FileReader();
      reader.readAsText(file);
      reader.addEventListener("load", () =>
        typeof reader.result === "string"
          ? resolve(reader.result!)
          : resolve(new Uint8Array(reader.result!))
      );
    }
  );
}

async function pickFileInput() {
  const input = document.createElement("input");
  input.type = "file";
  return new Promise<File>((resolve, reject) => {
    input.addEventListener("change", () => {
      if (input.files && input.files.length && input.files.item(0)) {
        const file = input.files.item(0)!;
        resolve(file);
      }
    });
    input.addEventListener("cancel", reject);
    input.click();
  });
}

const SAVE_FILTERS = [
  ...Object.entries(marshal)
    .filter(([k, v]) => !v.isParseOnly)
    .map(([k, v]) => ({
      name: "Explorable",
      extensions: v.extensions as unknown as string[],
      types: { [k]: v.extensions.map((ext) => "." + ext) },
    })),
];
const LOAD_FILTERS = [
  {
    name: "Explorable",
    extensions: Object.values(marshal).flatMap((v) => v.extensions),
    types: Object.fromEntries(
      Object.keys(marshal).map((k) => [
        k,
        (marshal as any)[k].extensions.map((ext: string) => "." + ext),
      ])
    ),
  },
  ...Object.entries(marshal).map(([k, v]) => ({
    name: "Explorable",
    extensions: v.extensions as unknown as string[],
    types: { [k]: v.extensions.map((ext) => "." + ext) },
  })),
];

type FileFormat = keyof typeof marshal;

export interface Client {
  readonly account: Account;
  readonly Environment: Environment;
}

export interface DocumentClient extends Client {
  /** Whether a given URL could be serviced by this client (same origin and username).*/
  isClientURL(url: URL): boolean;
  /** Save a document `doc` in the given `format` at the given `url`. If no `url` is provided, let the configured storage handle the specific location. If no format is provided, assume `html`. Returns the URL of the saved document. */
  saveDocument(
    doc: string | Uint8Array,
    url?: URL | string,
    filename?: string
  ): Promise<URL | undefined>;
  /** Load a document from the given `url` in the configured storage. If no `url` is provided, let the configured storage handle the specific location.*/
  loadDocument(url?: URL | string): Promise<string | Uint8Array | undefined>;
  /** Delete a document at the given URL. */
  deleteDocument?(url: string | URL): Promise<boolean>;
  /** Search the documents of configured storage. If no `options` are provided, return all documents. */
  searchDocuments?(options: {
    page?: number;
    perPage?: number;
    sort?: string;
    filter?: string;
    expand?: string;
    fields?: string;
    skipTotal?: boolean;
  }): Promise<URL[]>;
  /** Pick a location for saving in the configured storage. Returns the location as a URL. */
  pickSave?(): Promise<URL | undefined>;
  /** Pick a document from the configured storage. Returns the location as a URL. */
  pickLoad?(): Promise<URL | undefined>;
  /** Get the public URL of the given document. */
  getSharingURLForDocument?(url: string | URL): Promise<URL>;
}

export interface PackageClient extends Client {
  /** Search the packages of the configured registry. Returns an array of packages. */
  searchPackages(
    text: string,
    params?: {
      size?: number;
      quality?: number;
      popularity?: number;
      maintenance?: number;
    }
  ): Promise<Package[]>;
  /** Publish a local package at `path` to the configured registry. Returns the URL of the published package if successful. */
  publishPackage?(path: string): Promise<string>;
  /** Remove a local package at `path` from the configured registry. */
  unpublishPackage?(path: string): Promise<void>;
}

export interface AnalyticsClient extends Client {
  pushStatements(): void;
}

export interface LLMApiClient extends Client {
  getModel(): string;
  getCompany(): string;
  getApiKey(): string;
  account: LLMAccount;
}

export interface AuthenticationClient extends Client {
  /** Log in to the configured service with the configured credentials. */
  signIn(options?: {
    password?: string;
    cookie?: string;
    updateAccount?: boolean;
  }): Promise<void>;
  /** Log out of the configured service. */
  signOut(): Promise<void>;
  /** Return true if the service thinks it is still logged in (e.g. has an unexpired token). */
  get isSignedIn(): boolean;
}

// @ts-ignore: Fix account types
export class FileClient implements DocumentClient {
  constructor(
    readonly account: FileAccount,
    readonly Environment?: Environment
  ) {}

  get fileSystemSupported() {
    return "createWritable" in FileSystemFileHandle.prototype;
  }

  get showOpenFilePickerSupported() {
    return "showOpenFilePicker" in window;
  }

  get showSaveFilePickerSupported() {
    return "showSaveFilePicker" in window;
  }

  async saveDocument(
    doc: string | Uint8Array,
    url?: string | URL | FileSystemFileHandle,
    title?: string
  ) {
    if (
      WEBWRITER_ENVIRONMENT.backend === "tauri" &&
      this.Environment &&
      (!url || !(url instanceof FileSystemFileHandle))
    ) {
      const { OS, FS } = this.Environment;
      const binary = doc instanceof Uint8Array;
      const urlObj = url
        ? new URL(url)
        : ((await this.pickSave(undefined, title)) as URL | undefined);
      if (!urlObj) {
        return;
      }
      let path = decodeURI(urlObj.pathname).slice(1);
      path = ["darwin", "linux"].includes(await OS.platform())
        ? "/" + path
        : path;
      await FS.writeFile(path, doc, binary ? "binary" : "utf8");
      return urlObj;
    } else {
      if (this.fileSystemSupported && this.showSaveFilePickerSupported) {
        const handle =
          (url as FileSystemFileHandle) ??
          ((await this.pickSave()) as FileSystemFileHandle | undefined);
        const writable = await handle.createWritable();
        await writable.write(doc);
        await writable.close();
        return handle;
      } else {
        const blob = new Blob([doc]);
        const url = URL.createObjectURL(blob);
        writeFileDownload(url, "explorable.html");
        URL.revokeObjectURL(url);
      }
    }
  }

  async loadDocument(
    url?: string | FileSystemFileHandle | URL,
    binary = false
  ) {
    if (
      WEBWRITER_ENVIRONMENT.backend === "tauri" &&
      this.Environment &&
      !(url instanceof FileSystemFileHandle)
    ) {
      const { OS, FS } = this.Environment;
      const urlObj = url
        ? new URL(url)
        : ((await this.pickLoad()) as URL | undefined);
      if (!urlObj) {
        return;
      }
      let path = decodeURI(urlObj.pathname).slice(1);
      path = ["darwin", "linux"].includes(await OS.platform())
        ? "/" + path
        : path;
      let data = await FS.readFile(path, binary ? "binary" : "utf8");
      return data;
    } else if (this.showOpenFilePickerSupported) {
      const handle =
        (url as FileSystemFileHandle) ??
        ((await this.pickLoad()) as FileSystemFileHandle | undefined);
      if (!handle) {
        return;
      }
      const file = await handle.getFile();
      const reader = new FileReader();
      reader.readAsText(file);
      return new Promise<string | Uint8Array>((resolve) => {
        reader.addEventListener("load", () =>
          typeof reader.result === "string"
            ? resolve(reader.result!)
            : resolve(new Uint8Array(reader.result!))
        );
      });
    } else if (url) {
      throw Error(
        "Not supported in your browser or permissions for File System Access API are missing (try Chrome or Edge)"
      );
    } else {
      return readFileInput();
    }
  }

  async pickSave(
    filters: typeof SAVE_FILTERS = SAVE_FILTERS,
    defaultPath?: string
  ) {
    if (WEBWRITER_ENVIRONMENT.backend === "tauri" && this.Environment) {
      const path =
        ((await this.Environment.Dialog.promptWrite({
          filters,
          defaultPath,
        })) as null | string) ?? undefined;
      return path ? new URL(path, "file://") : undefined;
    } else if (this.showSaveFilePickerSupported) {
      try {
        let handle: FileSystemFileHandle = await (
          window as any
        ).showSaveFilePicker({
          startIn: "documents",
          types: filters.map((filter) => ({
            description: filter.name,
            accept: filter.types,
          })),
        });
        handle = Array.isArray(handle) ? handle[0] : handle;
        return handle;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          return undefined;
        } else {
          throw err;
        }
      }
    } else {
      throw Error(
        "Not supported in your browser or permissions for File System Access API are missing (try Chrome or Edge)"
      );
    }
  }

  async pickLoad(filters: typeof LOAD_FILTERS = LOAD_FILTERS) {
    if (WEBWRITER_ENVIRONMENT.backend === "tauri" && this.Environment) {
      const path =
        ((await this.Environment.Dialog.promptRead({ filters })) as
          | null
          | string) ?? undefined;
      return path ? new URL(path, "file://") : undefined;
    } else {
      if ("showOpenFilePicker" in window) {
        try {
          let handle: FileSystemFileHandle = await (
            window as any
          ).showOpenFilePicker({
            startIn: "documents",
            types: filters.map((filter) => ({
              description: filter.name,
              accept: filter.types,
            })),
          });
          handle = Array.isArray(handle) ? handle[0] : handle;
          return handle;
        } catch (err) {
          if ((err as Error)?.name === "AbortError") {
            return undefined;
          } else {
            throw err;
          }
        }
      } else {
        throw Error(
          "Not supported in your browser or permissions for File System Access API are missing (try Chrome or Edge)"
        );
      }
    }
  }

  isClientURL(url: URL) {
    return url.protocol === "file:";
  }
}

export class NpmClient implements PackageClient, AuthenticationClient {
  constructor(
    readonly account: NpmAccount,
    readonly Environment: Environment
  ) {}

  get isSignedIn(): boolean {
    // TODO: Check if token is present
    return false;
  }

  async signIn() {
    // TODO: Configure the package manager to use this registry
  }

  async signOut() {
    // TODO: If using this registry, clear it
  }

  async searchPackages(
    text: string,
    params?: {
      size?: number;
      quality?: number;
      popularity?: number;
      maintenance?: number;
    }
  ) {
    const { objects } = await this.Environment.search(text, params);
    return objects.map(({ package: pkg }) => new Package(pkg));
  }

  // Not supported by Bun yet
  /*
  async publishPackage(path: string) {

  }

  async unpublishPackage(path: string) {

  }*/
}

class PocketbaseAuthStore extends BaseAuthStore {
  constructor(
    readonly account: PocketbaseAccount,
    readonly onChangeAccount?: (account: PocketbaseAccount) => Promise<void>
  ) {
    super();
  }

  get token(): string {
    return this.account.token ?? "";
  }

  get model(): AuthModel | null {
    return this.account.model ?? null;
  }

  save(token: string, model?: AuthModel): void {
    if (token) {
      const newAccount = new PocketbaseAccount({
        ...this.account,
        token,
        model: model as any,
      });
      this.onChangeAccount && this.onChangeAccount(newAccount);
    }
  }

  clear(): void {
    const newAccount = new PocketbaseAccount({
      ...this.account,
      token: undefined,
      model: undefined,
    });
    this.onChangeAccount && this.onChangeAccount(newAccount);
  }
}

export class LLMClient implements LLMApiClient {
  constructor(
    readonly account: LLMAccount,
    readonly Environment: Environment
  ) {}

  getModel() {
    return this.account.model;
  }

  getCompany() {
    return this.account.company;
  }

  getApiKey() {
    return this.account.apiKey;
  }
}
export class PocketbaseClient implements DocumentClient, AuthenticationClient {
  #pocketbase: PocketBase;

  constructor(
    readonly account: PocketbaseAccount,
    readonly Environment: Environment,
    onChangeAccount?: (account: PocketbaseAccount) => Promise<void>
  ) {
    this.#pocketbase = new PocketBase(
      account.url,
      new PocketbaseAuthStore(account, onChangeAccount)
    );
  }

  async signIn(options?: {
    password?: string;
    cookie?: string;
    updateAccount?: boolean;
  }) {
    if (this.isSignedIn) {
      return;
    }
    if (options?.password) {
      const authModel = await this.#pocketbase
        .collection("users")
        .authWithPassword(this.account.email, options.password);
      if (options.updateAccount) {
        this.account.token = authModel.token;
      }
    } else if (options?.cookie) {
      return this.#pocketbase.authStore.loadFromCookie(options.cookie);
    }
  }

  async signOut(updateAccount = false) {
    this.#pocketbase.authStore.clear();
    if (updateAccount) {
      this.account.token = undefined;
    }
  }

  get isSignedIn() {
    const authStore = this.#pocketbase.authStore;
    return (authStore.isAuthRecord || authStore.isAdmin) && authStore.isValid;
  }

  private recordModelToURL(model: RecordModel) {
    const url = new URL(
      this.#pocketbase.buildUrl(
        `/api/collections/${model.collectionName}/records/${model.id}`
      )
    );
    url.username = this.account.email;
    url.searchParams.set("created", model.created);
    url.searchParams.set("updated", model.updated);
    url.searchParams.set("filename", model.file);
    url.searchParams.set("mediatype", "text/html");
    url.searchParams.set("apitype", "pocketbase");
    return url;
  }

  private idFromURL(url: string | URL) {
    return new URL(url).pathname.split("/").at(-1);
  }

  private filenameFromURL(url: string | URL) {
    return new URL(url).searchParams.get("filename") ?? undefined;
  }

  isClientURL(url: URL) {
    const originMatches = new URL(this.account.url).origin === url.origin;
    const usernameMatches =
      (this.account.id ?? this.account.email) === decodeURIComponent(url.username);
    return originMatches && usernameMatches;
  }

  async searchDocuments(options: {
    page?: number;
    perPage?: number;
    sort?: string;
    filter?: string;
    expand?: string;
    fields?: string;
    skipTotal?: boolean;
  }) {
    await this.signIn({ cookie: this.account.token });
    const docs = this.#pocketbase.collection("documents");
    const results = await docs.getList(options.page, options.perPage, options);
    return results.items.map((item) => this.recordModelToURL(item));
  }

  async saveDocument(
    doc: string | Uint8Array,
    url?: string | URL,
    filename?: string
  ) {
    const resolvedFilename =
      filename ||
      (url
        ? new URL(url).searchParams
            .get("filename")
            ?.replace(/\_\w{10}\.(\w+)/, ".$1") || ""
        : "");
    await this.signIn({ cookie: this.account.token });
    const docs = this.#pocketbase.collection("documents");
    const formData = new FormData();
    formData.append("owner", this.#pocketbase.authStore.model!.id);
    if (url) {
      const urlObj = new URL(url);
      const id = urlObj.pathname.split("/").at(-1)!;
      const toUpdate = await this.#pocketbase
        .collection("documents")
        .getOne(id);
      const toUpdateFilename = toUpdate.file.replace(/\_\w{10}\.(\w+)/, ".$1");
      const file = new File([doc], toUpdateFilename);
      formData.append("file", file);
      const updated = await this.#pocketbase
        .collection("documents")
        .update(id, formData);
      return this.recordModelToURL(updated);
    } else {
      const file = new File([doc], resolvedFilename);
      formData.append("file", file);
      const model = await docs.create(formData);
      return this.recordModelToURL(model);
    }
  }

  async loadDocument(url?: string | URL) {
    await this.signIn({ cookie: this.account.token });
    if (!url) {
      return undefined;
    }
    const id = this.idFromURL(url)!;
    const filename = this.filenameFromURL(url)!;
    const record = await this.#pocketbase.collection("documents").getOne(id);
    const fileURL = this.#pocketbase.files.getUrl(record, filename);
    const response = await fetch(fileURL);
    const blob = await response.blob();
    const content = await blob.text();
    return content;
  }

  async deleteDocument(url: string | URL) {
    await this.signIn({ cookie: this.account.token });
    const id = this.idFromURL(url);
    return this.#pocketbase.collection("documents").delete(id!);
  }

  async getSharingURLForDocument(url: string | URL) {
    const id = this.idFromURL(url)!;
    return new URL(`/explorables/${id}`, this.#pocketbase.baseUrl);
  }
}

export default {
  file: FileClient,
  pocketbase: PocketbaseClient,
  npm: NpmClient,
  llm: LLMClient,
};
