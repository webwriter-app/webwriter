export type CloudService = {
  id: string
  type: "edumix" | "url"
  url: string
  username: string
  accessToken?: string
  expiresAt?: number
  authentication?: "none"
}

export const EDUMIX_URL = "https://edumix.eu"

export function cloudServiceURL(value: string) {
  const url = new URL(value)
  if(!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new TypeError("Use an HTTPS provider URL (HTTP is supported for localhost).")
  }
  return url.href.replace(/\/$/, "")
}

/** Explicitly select persisted fields; passwords must never enter settings storage. */
export function storedCloudServices(value: unknown): CloudService[] {
  if(!Array.isArray(value)) return []
  const services: CloudService[] = []
  for(const item of value) {
    if(!item || typeof item.id !== "string" || !item.id || services.some(service => service.id === item.id)
      || !["edumix", "url"].includes(item.type) || typeof item.username !== "string") continue
    try {
      services.push({id: item.id, type: item.type, url: cloudServiceURL(item.type === "edumix" ? EDUMIX_URL : item.url),
        username: item.username,
        ...(typeof item.accessToken === "string" && item.accessToken ? {accessToken: item.accessToken} : {}),
        ...(typeof item.expiresAt === "number" && Number.isFinite(item.expiresAt) ? {expiresAt: item.expiresAt} : {}),
        ...(item.authentication === "none" ? {authentication: "none" as const} : {}),
      })
    }
    catch { /* Ignore malformed saved providers. */ }
  }
  return services
}

export function tokenExpiresAt(token: string): number | undefined {
  try {
    const payload = token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")
    const {exp} = JSON.parse(atob(payload))
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : undefined
  }
  catch {return undefined}
}

export function cloudServiceExpired(service: CloudService, now = Date.now()) {
  const expiry = service.expiresAt ?? (service.accessToken ? tokenExpiresAt(service.accessToken) : undefined)
  return expiry !== undefined && expiry <= now
}
