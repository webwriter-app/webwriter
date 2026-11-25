import {UserManager, WebStorageStateStore} from "oidc-client-ts"
import type {CloudOIDC, CloudService} from "./cloud-services"

// Sign-in for cloud services that advertise an identity provider (`oidc` in their session):
// a separate window shows the provider's login page, and oidc-client-ts exchanges the code
// there (Authorization Code + PKCE, public client). The editor stays open and untouched;
// WebWriter never sees a password. The access token becomes the service's bearer token as in
// the password flow. A refresh token, kept by oidc-client-ts, renews the short-lived access
// token without asking again.

/** The page the provider returns to inside the sign-in window (sign-in-callback.html). */
export const cloudSignInCallbackURL = (origin = location.origin) => new URL("/sign-in-callback.html", origin).href

/** One named window, so a sign-in started twice reuses it. */
const SIGN_IN_WINDOW = "webwriter-sign-in"
const SIGN_IN_WINDOW_FEATURES = {width: 520, height: 720}

const managers = new Map<string, UserManager>()

const userManager = (oidc: CloudOIDC) => {
  const key = `${oidc.issuer}\n${oidc.clientId}`
  let manager = managers.get(key)
  if(!manager) {
    manager = new UserManager({
      authority: oidc.issuer,
      client_id: oidc.clientId,
      redirect_uri: cloudSignInCallbackURL(),
      popup_redirect_uri: cloudSignInCallbackURL(),
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

/**
 * Opens the sign-in window right away, inside the click that asked for it, so the browser does
 * not block it while WebWriter still asks the service how to sign in. Returns a closer for when
 * the service turns out not to need it.
 */
export function openCloudSignInWindow() {
  const {width, height} = SIGN_IN_WINDOW_FEATURES
  const opened = window.open("about:blank", SIGN_IN_WINDOW, `popup,width=${width},height=${height}`)
  return () => {opened?.close()}
}

export type CloudSignInResult = {accessToken: string, expiresAt: number | undefined}

/** Signs in on the provider in the sign-in window; rejects if it is closed or blocked. */
export async function startCloudSignIn(service: CloudService & {oidc: CloudOIDC}): Promise<CloudSignInResult> {
  const user = await userManager(service.oidc).signinPopup({
    popupWindowTarget: SIGN_IN_WINDOW,
    popupWindowFeatures: SIGN_IN_WINDOW_FEATURES,
    popupAbortOnClose: true,
  })
  return {accessToken: user.access_token, expiresAt: user.expires_at === undefined ? undefined : user.expires_at * 1000}
}

/** A fresh access token from the stored refresh token, or null when the user must sign in again. */
export async function renewCloudSignIn(service: CloudService): Promise<CloudSignInResult | null> {
  if(!service.oidc) return null
  const manager = userManager(service.oidc)
  try {
    const stored = await manager.getUser()
    if(!stored?.refresh_token) return null
    const user = await manager.signinSilent()
    return user ? {accessToken: user.access_token,
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
