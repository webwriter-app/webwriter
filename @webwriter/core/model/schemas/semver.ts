import {z} from "zod"
import { SemVer as NodeSemVer, Range as NodeSemVerRange } from "semver"

export class SemVer extends NodeSemVer {

    static pattern = /(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>(?:0|[1-9]\d*|\d*[a-zA-Z\-][0-9a-zA-Z\-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z\-][0-9a-zA-Z\-]*))*))?(?:\+(?<buildmetadata>[0-9a-zA-Z\-]+(?:\.[0-9a-zA-Z\-]+)*))?/
  
    constructor(ver: string | SemVer | NodeSemVer, optionsOrLoose?: ConstructorParameters<typeof NodeSemVer>[1]) {
      super(ver, optionsOrLoose)
    }
    
    static schema = z.string().transform((x, ctx) => {
      try {
        return new this(x)
      }
      catch(err: any) {
        ctx.addIssue({code: z.ZodIssueCode.custom, message: err.message})
        return z.NEVER
      }
    }).or(z.instanceof(this))
  
    gt(other: string | SemVer | NodeSemVer) {
      return this.compare(other) === 1
    }
    
    lt(other: string | SemVer | NodeSemVer) {
      return this.compare(other) === -1
    }
    
    eq(other: string | SemVer | NodeSemVer) {
      return this.compare(other) === 0
    }

    inc(type: "major" | "minor" | "patch" ) {
      return this
    }

    dec(type: "major" | "minor" | "patch") {
      return this
    }
    
    toString() {
      const prerelease = this.prerelease.length? `-${this.prerelease.join(".")}`: ""
      const build = this.build.length? `+${this.build.join(".")}`: ""
      return `${this.major}.${this.minor}.${this.patch}${prerelease}${build}`
    }
    
    toJSON = () => this.toString()
  }
  
  export class SemVerRange extends NodeSemVerRange {
  
    constructor(range: string | SemVerRange | NodeSemVerRange, optionsOrLoose?: ConstructorParameters<typeof NodeSemVerRange>[1]) {
      super(range, optionsOrLoose)
    }
    
    static schema = z.string().transform((x, ctx) => {
      try {
        return new this(x)
      }
      catch(err: any) {
        ctx.addIssue({code: z.ZodIssueCode.custom, message: err.message})
        return z.NEVER
      }
    }).or(z.instanceof(this))
    
    toString = () => this.raw; toJSON = () => this.toString()
  }