import { filterObject, getFileExtension } from "../../utility";
import {
  FileClient,
  NpmClient,
  OpenAIClient,
  PocketbaseClient,
} from "../clients";
import { Environment } from "../environment";
import marshal from "../marshal";
import {
  FileAccount,
  NpmAccount,
  PocketbaseAccount,
  OpenAIAccount,
} from "../schemas/accounts";

type AccountsMap = AccountStore["accounts"];
export type AccountTypeId = keyof AccountStore["accounts"];
export type Account<T extends AccountTypeId = AccountTypeId> =
  AccountsMap[T][string];
export type Client<T extends AccountTypeId = AccountTypeId> = InstanceType<
  (typeof AccountStore)["clients"][T]
>;

/** Handles accounts. */
export class AccountStore {
  static accountType = {
    file: FileAccount,
    npm: NpmAccount,
    pocketbase: PocketbaseAccount,
    openai: OpenAIAccount,
  } as const;

  static clients = {
    file: FileClient,
    npm: NpmClient,
    pocketbase: PocketbaseClient,
    openai: OpenAIClient,
  } as const;

  static accountTypeIdMap = new Map(
    Object.entries(this.accountType).map(([k, v]) => [v, k])
  );

  static getAccountTypeId<T extends AccountTypeId>(account: Account<T>) {
    return this.accountTypeIdMap.get(account.constructor as any) as T;
  }

  constructor(
    readonly Environment: Environment,
    accounts?: AccountStore["accounts"]
  ) {
    this.accounts = accounts ?? this.accounts;
  }

  #accounts = {
    file: {
      file: new FileAccount({}),
    } as Record<string, FileAccount>,
    pocketbase: {} as Record<string, PocketbaseAccount>,
    npm: {} as Record<string, NpmAccount>,
    openai: {} as Record<string, OpenAIAccount>,
  };

  get accounts() {
    return this.#accounts;
  }

  set accounts(value) {
    this.#accounts = value;
  }

  get clients() {
    return Object.fromEntries(
      Object.keys(this.accounts).map((key) => [
        key,
        Object.fromEntries(
          Object.keys((this.accounts as any)[key]).map((name) => [
            name,
            this.getClient(key as any, name),
          ])
        ),
      ])
    ) as { file: { [k: string]: FileClient } } & Partial<{
      npm: Record<string, NpmClient>;
      pocketbase: Record<string, PocketbaseClient>;
      openai: Record<string, OpenAIClient>;
    }>;
  }

  get clientTriples() {
    return Object.entries(this.clients).flatMap(([type, clientsOfType]) =>
      Object.entries(clientsOfType).map(([name, client]) => [
        type,
        name,
        client,
      ])
    ) as unknown as [
      keyof (typeof AccountStore)["accountType"],
      string,
      Client
    ][];
  }

  getAccount<T extends AccountTypeId>(type: T, name?: string) {
    return type in this.accounts
      ? this.accounts[type]![name ?? Object.keys(this.accounts[type])[0]]
      : undefined;
  }

  addAccount<T extends AccountTypeId>(value: Account<T>) {
    const type = AccountStore.getAccountTypeId(value);
    this.accounts[type] = { ...this.accounts[type], [value.id]: value };
    return this.getAccount(type, value.id);
  }

  updateAccount<T extends AccountTypeId>(value: Account<T>) {
    console.log(value);
    const type = AccountStore.getAccountTypeId(value);
    if (type in this.accounts) {
      this.accounts[type][value.id] = value;
    } else {
      throw TypeError(`Account of type ${type} not found`);
    }
  }

  removeAccount<T extends AccountTypeId>(type: T | Account<T>, name: string) {
    if (type === "file" || type instanceof FileAccount) {
      throw TypeError("Cannot remove accounts of type 'file'");
    } else if (typeof type !== "string") {
      const inferredType = AccountStore.getAccountTypeId(type);
      delete this.accounts[inferredType][name];
    } else if (type in this.accounts && name in this.accounts[type]) {
      delete this.accounts[type][name];
    } else {
      throw TypeError(`Account of type ${type} not found`);
    }
  }

  getClient<T extends AccountTypeId>(type: T, name: string) {
    const account = this.getAccount(type, name) as any;
    const client = account
      ? (new AccountStore.clients[type](
          account,
          this.Environment,
          async (newAccount) => this.updateAccount(newAccount)
        ) as Client<T>)
      : undefined;
    return client;
  }

  get size() {
    return Object.values(this.accounts).reduce(
      (acc, current) => acc + Object.values(current).length,
      0
    );
  }

  clientFromURL(url: URL) {
    return this.clientTriples
      .map(([_, __, client]) => client)
      .filter((client) => "isClientURL" in client)
      .find((client) => client.isClientURL(url));
  }

  clientNameFromURL(url: URL) {
    const triple =
      this.clientTriples.find(
        ([type, id, client]) => client === this.clientFromURL(url)
      ) ?? [];
    return `${triple[0]} ${triple[1]}`;
  }

  parserSerializerFromURL(url: URL) {
    const mediaType = url.searchParams.get("mediatype");
    if (url.protocol === "file:") {
      const ext = getFileExtension(url.pathname);
      const PS = Object.values(marshal).find((PS) =>
        (PS.extensions as any).includes(ext)
      );
      return PS ? new PS(this.Environment) : undefined;
    }
    if ((mediaType ?? "") in marshal) {
      return new marshal[mediaType as keyof typeof marshal](this.Environment);
    } else {
      return undefined;
    }
  }
}
