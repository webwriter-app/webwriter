import { z } from "zod";

export type Account = NpmAccount | PocketbaseAccount;

export interface NpmAccount
  extends z.infer<(typeof NpmAccount)["objectSchema"]> {}
export class NpmAccount {
  static readonly key = "npm" as const;

  static objectSchema = z
    .object({
      url: z.string().url(),
      key: z.string().optional(),
    })
    .transform((arg) => ({
      ...arg,
      url: arg.url.endsWith("/") ? arg.url : arg.url + "/",
    }));

  get authUrl() {
    return `${this.url}` + (this.key ? `:_authToken=${this.key}` : "");
  }

  get id() {
    return `${this.key}@${this.url}`;
  }

  static schema = NpmAccount.objectSchema
    .transform((x) => new NpmAccount(x))
    .or(z.instanceof(NpmAccount));

  constructor(
    value: z.input<(typeof NpmAccount)["objectSchema"]> | NpmAccount
  ) {
    return Object.assign(this, value);
  }
}

export interface PocketbaseAccount
  extends z.infer<(typeof PocketbaseAccount)["objectSchema"]> {}
export class PocketbaseAccount {
  static readonly key = "pocketbase" as const;

  static objectSchema = z.object({
    url: z
      .string()
      .url()
      .transform((arg) => (arg.endsWith("/") ? arg : arg + "/")),
    email: z.string().email(),
    token: z.string().optional(),
    model: z
      .object({
        id: z.string().optional(),
        username: z.string().optional(),
        email: z.string().email().optional(),
        emailVisibility: z.boolean().optional(),
        verified: z.boolean().optional(),
      })
      .optional(),
  });

  get id() {
    return this.email;
  }

  static schema = PocketbaseAccount.objectSchema
    .transform((x) => new PocketbaseAccount(x))
    .or(z.instanceof(PocketbaseAccount));

  constructor(
    value:
      | z.input<(typeof PocketbaseAccount)["objectSchema"]>
      | PocketbaseAccount
  ) {
    return Object.assign(this, value);
  }
}

export interface FileAccount
  extends z.infer<(typeof FileAccount)["objectSchema"]> {}
export class FileAccount {
  static readonly key = "file" as const;

  static objectSchema = z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
  });

  get id() {
    return "file" as const;
  }

  static schema = FileAccount.objectSchema
    .transform((x) => new FileAccount(x))
    .or(z.instanceof(FileAccount));

  constructor(
    value: z.input<(typeof FileAccount)["objectSchema"]> | FileAccount
  ) {
    return Object.assign(this, value);
  }
}

// @meeting
export interface OpenAIAccount
  extends z.infer<(typeof OpenAIAccount)["objectSchema"]> {}
export class OpenAIAccount {
  static readonly key = "openai" as const;

  static objectSchema = z.object({
    apikey: z.string(),
  });

  get id() {
    return "openai" as const;
  }

  static schema = OpenAIAccount.objectSchema
    .transform((x) => new OpenAIAccount(x))
    .or(z.instanceof(OpenAIAccount));

  constructor(
    value: z.input<(typeof OpenAIAccount)["objectSchema"]> | OpenAIAccount
  ) {
    return Object.assign(this, value);
  }
}
