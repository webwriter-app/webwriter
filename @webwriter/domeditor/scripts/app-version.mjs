import { randomUUID } from 'node:crypto'

const virtualModuleId = 'virtual:app-version'
const resolvedVirtualModuleId = '\0' + virtualModuleId
// Match the UUID's length so replacing the generated literal preserves source-map columns.
const versionPlaceholder = '__WEBWRITER_APP_VERSION__'.padEnd(36, '_')

export function appVersionPlugin() {
  let command = 'serve'
  let version = ''

  return {
    name: 'webwriter-app-version',
    configResolved(config) {
      command = config.command
    },
    buildStart() {
      version = command === 'build' ? randomUUID() : ''
    },
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        return `export default ${JSON.stringify(command === 'build' ? versionPlaceholder : '')}`
      }
    },
    renderChunk(code) {
      if (command === 'build' && code.includes(versionPlaceholder)) {
        return {code: code.replaceAll(versionPlaceholder, version), map: null}
      }
    },
    generateBundle() {
      if (command === 'build') {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version }),
        })
      }
    },
  }
}
