import SPDX_LICENSE_MAP from "spdx-license-list"
import { z } from "zod"


export class License {

    static schema = z.string().transform(x => new this(x)).or(z.instanceof(this))
  
    static spdxLicenseKeys = Object.keys(SPDX_LICENSE_MAP)
    
    key: string
    
    constructor(key: string | {key: string}) {
      this.key = typeof key === "string"? key: key.key
    }
  
    get name() {
      return SPDX_LICENSE_MAP[this.key]?.name
    }
  
    get url() {
      return SPDX_LICENSE_MAP[this.key]?.url
    }
  
    get osiApproved() {
      return SPDX_LICENSE_MAP[this.key]?.osiApproved
    }
  
    toString() {
      return this.key
    }
  
    toJSON() {
      return this.toString()
    }
  
  }