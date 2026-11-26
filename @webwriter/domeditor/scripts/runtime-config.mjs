// Loads /runtime-config.js before any module on every HTML page, so a server can set deployment
// settings (src/runtime-config.ts) when the container starts instead of when the image is built.
// Caddy answers the path itself from APP_ORIGIN, EDITOR_ORIGIN and EDUMIX_URL (../../Caddyfile);
// the dev server and the emitted file provide an empty default for every other server.
export const runtimeConfigFile = 'runtime-config.js'
export const defaultRuntimeConfig = 'globalThis.webwriterRuntimeConfig = {}\n'

export function runtimeConfigPlugin() {
  let base = '/'
  let command = 'serve'

  return {
    name: 'webwriter-runtime-config',
    configResolved(config) {
      base = config.base
      command = config.command
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (new URL(request.url ?? '/', 'http://localhost').pathname !== `${base}${runtimeConfigFile}`) return next()
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache')
        response.end(defaultRuntimeConfig)
      })
    },
    transformIndexHtml() {
      // A classic script runs before the deferred module scripts that read the settings.
      return [{tag: 'script', attrs: {src: `${base}${runtimeConfigFile}`}, injectTo: 'head-prepend'}]
    },
    generateBundle() {
      if (command === 'build') this.emitFile({type: 'asset', fileName: runtimeConfigFile, source: defaultRuntimeConfig})
    },
  }
}
