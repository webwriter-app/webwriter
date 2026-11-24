import {UserManager} from "oidc-client-ts"

// Runs in the sign-in window (cloud-sign-in.ts) after the identity provider returns: hands the
// response to the editor that opened the window, which exchanges the code. The settings below
// are unused here; oidc-client-ts only needs them to construct its manager.
const message = document.getElementById("message")

new UserManager({authority: location.origin, client_id: "sign-in-callback", redirect_uri: location.href})
  .signinPopupCallback()
  .catch(() => {
    if(message) message.textContent = "Sign-in could not reach WebWriter. Close this window and sign in again from WebWriter's settings."
  })
