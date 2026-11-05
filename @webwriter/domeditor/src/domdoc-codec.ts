export const INTERNAL_NODE_KIND = "__domeditor_node_kind"
export const INTERNAL_NAMESPACE = "__domeditor_namespace"
export const INTERNAL_QUALIFIED_NAME = "__domeditor_qualified_name"
export const INTERNAL_MINIMUM_REPAIR = "__domeditor_minimum_repair"
export const INTERNAL_USER_ATTRIBUTE_PREFIX = "__domeditor_user_attribute__"
export const INTERNAL_NAMESPACED_ATTRIBUTE_PREFIX = "__domeditor_namespaced_attribute__"
export const COMMENT_NODE_NAME = "domeditor-comment"
export const COMMENT_NODE_KIND = "comment"
export const PROCESSING_INSTRUCTION_NODE_KIND = "processing-instruction"
export const PROCESSING_INSTRUCTION_TARGET = "__domeditor_processing_instruction_target"

export function decodeSharedDOMAttribute(name: string): {name: string, namespaceURI: string | null} | null {
  if(name === INTERNAL_NODE_KIND || name === INTERNAL_NAMESPACE || name === INTERNAL_QUALIFIED_NAME || name === INTERNAL_MINIMUM_REPAIR || name === "class") return null
  if(name.startsWith(INTERNAL_NAMESPACED_ATTRIBUTE_PREFIX)) {
    try {
      const value = JSON.parse(decodeURIComponent(name.slice(INTERNAL_NAMESPACED_ATTRIBUTE_PREFIX.length)))
      if(Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "string") {
        return {namespaceURI: value[0], name: value[1]}
      }
    }
    catch {
      // Ignore malformed internal metadata from an untrusted remote update.
    }
    return null
  }
  if(name.startsWith(INTERNAL_USER_ATTRIBUTE_PREFIX)) {
    try {
      const decoded = decodeURIComponent(name.slice(INTERNAL_USER_ATTRIBUTE_PREFIX.length))
      return {namespaceURI: null, name: decoded}
    }
    catch {
      return null
    }
  }
  return {namespaceURI: null, name}
}
