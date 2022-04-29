import {Document} from "../model"

export function parse(data: string) {
  return new Document(undefined, data)
}

export function serialize(data: Document) {
  return data.text
}