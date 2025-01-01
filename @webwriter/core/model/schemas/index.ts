import { z, ZodError, ZodSchema } from "zod";
import { fromZodError } from "zod-validation-error";

export * from "./account"
export * from "./contentexpression"
export * from "./cssvalue"
export * from "./cssvaluedefinition"
export * from "./license"
export * from "./locale"
export * from "./mediatype"
export * from "./package"
export * from "./resource"
export * from "./semver"

export type Constructor<T> = new (...args: any[]) => T;

export function DataType<T extends ZodSchema>(schema: T) {
  abstract class BaseDataType {

    constructor(data: unknown, params?: Partial<z.ParseParams>) {
      try {
        Object.assign(this, schema.parse(data, params))
      }
      catch(err) {
        throw new Error(fromZodError(err as ZodError, {prefix: `${this.constructor.name}`}).message)

      }
    }

    abstract serialize(format?: string): any

    toString() {
      return this.serialize()
    }

    toJSON() {
      return this.serialize()
    }

    static get schema(): T {
      return schema.transform(value => new (this as any)(value)) as any
    }
  }

  return Object.assign(BaseDataType, schema) as unknown as (typeof BaseDataType) & Constructor<z.infer<T>> & T
}

export function PrimitiveDataType<T extends ZodSchema>(schema: T) {
  abstract class Base {}
  return Object.assign(Base, schema) as unknown as (typeof Base) & T
}