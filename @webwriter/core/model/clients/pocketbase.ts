import PocketBase, {AuthModel, BaseAuthStore, RecordModel} from "pocketbase";
import { PocketbaseAccount } from "#schemas";
import { AuthenticationClient, DocumentClient, DocumentMetadata } from ".";

function getCookie(name: string) {
  function escape(s: string) { return s.replace(/([.*+?\^$(){}|\[\]\/\\])/g, '\\$1'); }
  var match = document.cookie.match(RegExp('(?:^|;\\s*)' + escape(name) + '=([^;]*)'));
  return match ? match[1] : null;
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
      console.log("save", token, model)
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
  
  export class PocketbaseClient implements DocumentClient, AuthenticationClient {
    #pocketbase: PocketBase;
  
    constructor(
      readonly account: PocketbaseAccount,
      onChangeAccount?: (account: PocketbaseAccount) => Promise<void>
    ) {
      this.#pocketbase = new PocketBase(
        account.url,
        new PocketbaseAuthStore(account, onChangeAccount)
      );
      const cookie = getCookie("pb_auth")
      console.log(cookie)
      cookie && this.#pocketbase.authStore.loadFromCookie(cookie)
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

    get id() {
      return this.account.id ?? this.account.email
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
      const results = await docs.getList(options.page, options.perPage, {expand: "owner", ...options});
      const final = results.items.map((item) => ({
        url: this.recordModelToURL(item),
        metadata: {access: item.access, owner: item.owner}
      }));
      // console.log(final)
      return final
    }
  
    async saveDocument(
      doc: string | Uint8Array,
      url?: string | URL,
      metadata?: DocumentMetadata
    ) {
      const resolvedFilename =
        metadata?.filename ||
        (url
          ? new URL(url).searchParams
              .get("filename")
              ?.replace(/\_\w{10}\.(\w+)/, ".$1") || ""
          : "");
      await this.signIn({ cookie: this.account.token });
      const docs = this.#pocketbase.collection("documents");
      const formData = new FormData();
      formData.append("owner", this.#pocketbase.authStore.model!.id);
      formData.append("access", metadata?.access ?? "community")
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
        return {url: this.recordModelToURL(updated), metadata: {filename: resolvedFilename, access: updated.access}};
      } else {
        const file = new File([doc], resolvedFilename);
        formData.append("file", file);
        const model = await docs.create(formData);
        return {url: this.recordModelToURL(model), metadata: {filename: resolvedFilename, access: model.access}};
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
      const {access, owner} = record
      const fileURL = this.#pocketbase.files.getUrl(record, filename);
      const response = await fetch(fileURL);
      const blob = await response.blob();
      const content = await blob.text();
      return {content, metadata: {access, owner}};
    }
  
    async deleteDocument(url: FileSystemFileHandle | URL) {
      if(url instanceof FileSystemFileHandle) {
        throw TypeError("Received FileSystemFileHandle, expected URL")
      }
      await this.signIn({ cookie: this.account.token });
      const id = this.idFromURL(url);
      return this.#pocketbase.collection("documents").delete(id!);
    }
  
    async getSharingURLForDocument(url: FileSystemFileHandle | URL) {
      if(url instanceof FileSystemFileHandle) {
        throw TypeError("Received FileSystemFileHandle, expected URL")
      }
      const id = this.idFromURL(url)!;
      return new URL(`/explorables/${id}`, this.#pocketbase.baseUrl);
    }
  }