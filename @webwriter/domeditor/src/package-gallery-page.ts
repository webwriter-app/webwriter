import {packageNameFromPath} from "./package-gallery-route"

const intro = document.querySelector<HTMLElement>(".gallery-intro")
const title = document.title

function updatePageTitle() {
  const name = packageNameFromPath(location.pathname)
  if(intro) intro.hidden = !!name
  document.title = name ? `${name} · WebWriter` : title
}

updatePageTitle()
document.addEventListener("package-page-change", updatePageTitle)
