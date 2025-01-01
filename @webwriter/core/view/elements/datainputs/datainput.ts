import { ComplexAttributeConverter } from "lit"
import { SlInput } from "@shoelace-style/shoelace"
import { z } from "zod"

import { DataType } from "#model"

export type DataInput<T=any> = 
& {value: T, defaultValue?: T} 
& Pick<SlInput,
  | "name"
  | "disabled"
  | "form"
  | "validity"
  | "validationMessage"
  | "focus"
  | "blur"
  | "checkValidity"
  | "reportValidity"
  | "setCustomValidity"
  | "getForm"
> 
& Partial<Pick<SlInput,
  | "label"
  | "required"
>>


export function schemaConverter<T extends ReturnType<typeof DataType>>(): ComplexAttributeConverter<z.infer<T>, T> {
  return {
    fromAttribute(value, type) {
      try {
        return new (type as any)!(value)
      }
      catch(err) {
        return value       
      }
    },
    toAttribute: String
  }
}