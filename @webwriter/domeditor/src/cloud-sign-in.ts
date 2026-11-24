import {UserManager, WebStorageStateStore, type User} from "oidc-client-ts"
import type {CloudOIDC, CloudService} from "./cloud-services"

// Sign-in for cloud services that advertise an identity provider (`oidc` in their session):
// the browser goes to the provider's login page and returns with a code, which oidc-client-ts
// exchanges (Authorization Code + PKCE, public client). WebWriter never sees a password; the
// access token becomes the service's bearer token as in the password flow. A refresh token,
// kept by oidc-client-ts, renews the short-lived access token without leaving the editor.

/** Where the provider returns to: the editor, which completes the sign-in on load. */
export const cloudSignInRedirectURL = (origin = location.origin) => new URL("/editor/", origin).href

const managers = new Map<string, UserManager>()

const userManager = (oidc: CloudOIDC) => {
  const key = `${oidc.issuer}\n${oidc.clientId}`
  let manager = managers.get(key)
  if(!manager) {
    manager = new UserManager({
      authority: oidc.issuer,
      client_id: oidc.clientId,
      redirect_uri: cloudSignInRedirectURL(),
      post_logout_redirect_uri: cloudSignInRedirectURL(),
      response_type: "code",
      scope: "openid profile email",
      // Survives reloads, so a refresh token outlives the five-minute access token.
      userStore: new WebStorageStateStore({store: localStorage}),
      automaticSilentRenew: false,
      monitorSession: false,
      loadUserInfo: false,
    })
    managers.set(key, manager)
  }
  return manager
}

type SignInState = {serviceId: string, returnTo: string}

/** Leaves for the provider's login page; the browser comes back to the editor. */
export async function startCloudSignIn(service: CloudService & {oidc: CloudOIDC}, returnTo = location.href) {
  await userManager(service.oidc).signinRedirect({state: {serviceId: service.id, returnTo} satisfies SignInState})
}

/** Whether this page load is the provider returning from a sign-in. */
export function isCloudSignInCallback(url = new URL(location.href)) {
  return url.pathname === new URL(cloudSignInRedirectURL(url.origin)).pathname
    && url.searchParams.has("state") && (url.searchParams.has("code") || url.searchParams.has("error"))
}

export type CloudSignInResult = {serviceId: string, accessToken: string, expiresAt: number | undefined, returnTo: string}

const signInResult = (user: User, serviceId: string, returnTo: string): CloudSignInResult => ({
  serviceId,
  accessToken: user.access_token,
  expiresAt: user.expires_at === undefined ? undefined : user.expires_at * 1000,
  returnTo,
})

/** Same-origin URL to show after the callback, without the provider's query parameters. */
const safeReturnTo = (value: unknown) => {
  try {
    const url = new URL(typeof value === "string" ? value : "", location.href)
    if(url.origin === location.origin) return url.href
  }
  catch { /* Fall back to the editor. */ }
  return cloudSignInRedirectURL()
}

/** Completes a sign-in the provider returned from, for whichever service started it; throws otherwise. */
export async function completeCloudSignIn(services: CloudService[], url = location.href): Promise<CloudSignInResult> {
  let lastError: unknown = new Error("No cloud service can complete this sign-in.")
  for(const service of services) {
    if(!service.oidc) continue
    try {
      const user = await userManager(service.oidc).signinRedirectCallback(url)
      const state = (user.state ?? {}) as Partial<SignInState>
      return signInResult(user, typeof state.serviceId === "string" ? state.serviceId : service.id, safeReturnTo(state.returnTo))
    }
    catch(error) {lastError = error}
  }
  throw lastError
}

/** A fresh access token from the stored refresh token, or null when the user must sign in again. */
export async function renewCloudSignIn(service: CloudService): Promise<Omit<CloudSignInResult, "returnTo"> | null> {
  if(!service.oidc) return null
  const manager = userManager(service.oidc)
  try {
    const stored = await manager.getUser()
    if(!stored?.refresh_token) return null
    const user = await manager.signinSilent()
    return user ? {serviceId: service.id, accessToken: user.access_token,
      expiresAt: user.expires_at === undefined ? undefined : user.expires_at * 1000} : null
  }
  catch {
    return null
  }
}

/** Forgets the stored tokens of a service's identity provider in this browser. */
export async function forgetCloudSignIn(service: CloudService) {
  if(service.oidc) await userManager(service.oidc).removeUser().catch(() => {})
}
