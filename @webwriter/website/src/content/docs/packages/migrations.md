---
title: Migrations
order: 202
---

# Migrations

Packages may define a `migrate` script which is run before a document is loaded, updating outdated content.

## Configure migration script
The migration script should be defined in the package's `exports`. The key must be `./migrate.js`. As the value, either put the path to a JS script, or use the `@webwriter/build` syntax to compile a TS script instead (see below).

**`package.json`**
```json
{
  ...
  "exports": {
    ...
    "./migrate.js": {
      "source": "./src/migrate.ts",
      "default": "./dist/migrate.js"
    },
  }
}
```

## Implement migration script
The migration script should register an event listener on the document for the custom `migrate` event. This event is fired on any element deemed outdated by the editor and bubbles up.

The event listener should first check the related package name and version (see below), which are included as HTML classes on the element (`ww-pkg-...` and `ww-v...`). If the script can handle that package name and version, a migration can begin.

For the migration, the event listener should mutate the DOM as needed (setting and removing attributes, children, and so on). If a migration is not possible, the listener should return without mutations.

For nested content (e.g. widgets containing widgets), `migrate` events are fired in order from inner to outer elements, meaning the migration does not need to handle recursion itself, and may even replace the element completely without breaking later migrations. 

Finally, **the listener must update the package version stored in the class name** (see below). Otherwise, the user will receive a warning that the document may break on loading due to outdated content.

The system is flexible and can also be used to handle renamed packages. For this, listen to `migrate` events for the old package name and replace the old with the new custom element.

Overall, it is helpful to import the current `package.json` as a module so the migration script can always reference the latest package name and version.

**`migrate.ts/js`**
```ts
import pkg from "../package.json"
document.addEventListener("migrate", ev => {
  // Get element to migrate, its package and current version
  const el = ev.target as HTMLElement // remove "as..." for pure JS 
  const semver = Array.from(el.classList).find(cls => cls.startsWith("ww-v"))?.slice("ww-v".length)
  const majorVersion = parseInt(semver ?? "")
  const pkgName = Array.from(el.classList).find(cls => cls.startsWith("ww-pkg-"))?.slice("ww-pkg-".length)
  
  // Migrate depending on package ID and major version (1.y.z) match
  if(majorVersion === 1 && pkg.name === pkgName) {
    el.setAttribute("data-example", "migrate...")
  } else return;
  // Finally, replace old version class string
  el.classList.replace(`ww-v${semver}`, `ww-v${pkg.version}`)
})
```
