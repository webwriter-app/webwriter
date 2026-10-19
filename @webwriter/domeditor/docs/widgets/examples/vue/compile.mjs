import {compileScript, compileStyle, parse} from "@vue/compiler-sfc"

export function compileVue(source, filename) {
  let {descriptor, errors} = parse(source, {filename})
  if(errors.length) throw errors[0]
  if(!descriptor.script && !descriptor.scriptSetup) {
    ;({descriptor, errors} = parse(`${source}\n<script setup>const __empty = true</script>`, {filename}))
    if(errors.length) throw errors[0]
  }

  const id = `vue-widget-${filename.replace(/[^a-z0-9]/gi, "-")}`
  const script = compileScript(descriptor, {
    id,
    inlineTemplate: true,
    customElement: true,
  })
  const styles = descriptor.styles.map(style => compileStyle({
    source: style.content,
    filename,
    id,
    scoped: style.scoped,
  }).code)

  let code = script.content.replace(/from (["'])vue\1/g, 'from "vue/dist/vue.runtime.esm-browser.js"')
  if(styles.length) {
    code = code.replace("export default {", "const __vueWidgetComponent = {")
    code += `\n__vueWidgetComponent.styles = ${JSON.stringify(styles)}\nexport default __vueWidgetComponent\n`
  }
  return code
}
