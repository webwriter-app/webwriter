import {Package} from "../@webwriter/core/model/schemas/packageschema"
import { zodToJsonSchema } from "zod-to-json-schema"
import {writeFileSync} from "fs"

const schemaObj = zodToJsonSchema(Package.coreObjectSchema, "webwriterpackage")
schemaObj.$schema = "https://json.schemastore.org/package.json";
(schemaObj as any).definitions.webwriterpackage.additionalProperties = true;
(schemaObj as any).definitions.webwriterpackage.properties.$schema = {type: "string"}
const schemaStr = JSON.stringify(schemaObj, undefined, 2)
writeFileSync("./webwriterpackage.json", schemaStr, "utf8")

