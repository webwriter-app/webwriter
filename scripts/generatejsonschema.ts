import {Package} from "../@webwriter/core/model/schemas/packageschema"
import { zodToJsonSchema } from "zod-to-json-schema"
import {writeFileSync} from "fs"

const schemaObj = zodToJsonSchema(Package.coreObjectSchema)
const schemaStr = JSON.stringify(schemaObj, undefined, 2)
writeFileSync("./webwriterpackage.json", schemaStr, "utf8")

