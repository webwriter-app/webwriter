import { Account, LLMAccount, Package } from "#schemas";
import { FileClient, LLMClient, PocketbaseClient, HTTPClient } from "#model";

export * from "./file";
export * from "./llm";
export * from "./pocketbase";
export * from "./http"

export interface Client {
  readonly account?: Account;
}

export interface DocumentMetadata {
  access?: "public" | "community" | "private"
  filename?: string,
  [k: string]: any
}

export interface DocumentClient extends Client {
  /** Whether a given URL could be serviced by this client (same origin and username).*/
  isClientURL(url: URL): boolean;
  /** Save a document `doc` in the given `format` at the given `url`. If no `url` is provided, let the configured storage handle the specific location. Optionally provide `metadata` . Returns the URL of the saved document. */
  saveDocument?(
    doc: string | Uint8Array,
    url?: URL | string,
    metadata?: DocumentMetadata
  ): Promise<{url: FileSystemFileHandle | URL, metadata?: DocumentMetadata} | undefined>;
  /** Load a document from the given `url` in the configured storage. If no `url` is provided, let the configured storage handle the specific location.*/
  loadDocument(url?: FileSystemFileHandle | URL | string): Promise<{content: string | Uint8Array, metadata?: DocumentMetadata} | undefined>;
  /** Delete a document at the given URL. */
  deleteDocument?(url: FileSystemFileHandle | URL): Promise<boolean>;
  /** Search the documents of configured storage. If no `options` are provided, return all documents. */
  searchDocuments?(options: {
    page?: number;
    perPage?: number;
    sort?: string;
    filter?: string;
    expand?: string;
    fields?: string;
    skipTotal?: boolean;
  }): Promise<{url: URL, metadata?: DocumentMetadata}[]>;
  /** Pick a location for saving in the configured storage. Returns the location as a URL. */
  pickSave?(): Promise<FileSystemFileHandle | URL | undefined>;
  /** Pick a document from the configured storage. Returns the location as a URL. */
  pickLoad?(): Promise<FileSystemFileHandle | URL | undefined>;
  /** Get the public URL of the given document. */
  getSharingURLForDocument?(url: FileSystemFileHandle | URL): Promise<URL>;
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

export default {
  file: FileClient,
  pocketbase: PocketbaseClient,
  llm: LLMClient,
  http: HTTPClient
};
