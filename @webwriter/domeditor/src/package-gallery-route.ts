export const packageGalleryPath = "/packages/"

export function packageNameFromPath(pathname: string) {
  const match = /^\/packages\/(@[a-z0-9_][a-z0-9._-]*)\/([a-z0-9_][a-z0-9._-]*)\/?$/.exec(pathname)
  return match ? `${match[1]}/${match[2]}` : null
}

export function packageGalleryURL(name: string) {
  return `${packageGalleryPath}${name}/`
}
