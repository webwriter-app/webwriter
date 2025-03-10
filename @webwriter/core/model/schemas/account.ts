import { z } from "zod";

export type Account = PocketbaseAccount | LLMAccount;

export type AccountTypeId = (typeof PocketbaseAccount)["key"] | (typeof LLMAccount)["key"] | "file"

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

export interface LLMAccount
  extends z.infer<(typeof LLMAccount)["objectSchema"]> {}
export class LLMAccount {
  static readonly key = "llm" as const;

  static objectSchema = z.object({
    company: z.string(),
    model: z.string(),
    apiKey: z.string(),
  });

  get data() {
    return {
      company: this.company,
      model: this.model,
      apiKey: this.apiKey,
    };
  }

  get id() {
    return "llm" as const;
  }

  static schema = LLMAccount.objectSchema
    .transform((x) => new LLMAccount(x))
    .or(z.instanceof(LLMAccount));

  constructor(
    value: z.input<(typeof LLMAccount)["objectSchema"]> | LLMAccount
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
