import { createSchema, Package, PackageStore } from ".."
import { ResourceStore } from "./resourcestore"

export * from "./packagestore"
export * from "./resourcestore"

type AllOptions = ConstructorParameters<typeof PackageStore>[0] & ConstructorParameters<typeof ResourceStore>[0]

export class RootStore {

  static storeKeys = ["packages", "resources"]
  packages: PackageStore
  resources: ResourceStore

  constructor({corePackages, schema, FS, Path, Shell, HTTP, bundle, search, npm}: AllOptions) {
    const onImport = this.onImportPackages
    this.packages = new PackageStore({corePackages, FS, Path, Shell, HTTP, bundle, search, npm, onImport})
    this.resources = new ResourceStore({schema, bundle})
  }

  onImportPackages = (packages: Package[]) => {
    this.resources.schema = createSchema(packages.map(pkg => pkg.name))
  }
}