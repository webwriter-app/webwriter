import {Command} from "@tauri-apps/api/shell"

class PackageManager {

  npmAvailable: Promise<void>

  constructor() {
    
    this.npmAvailable = this.npm("").then(() => {}, () => {this.fnm("install")})
  }

  private async npm(subcommand: string, args: string[] = []) {
    const output = await new Command("npm", [subcommand, ...args]).execute()
    if(output.code !== 0) {
      throw Error(output.stderr)
    }
    else {
      return output
    }
  }

  private async fnm(subcommand: string, args: string[] = []) {
    const output = await new Command("fnm", [subcommand, ...args]).execute()
    if(output.code !== 0) {
      throw Error(output.stderr)
    }
    else {
      return output
    }
  }

  async install(args: string[] = []) {
    const result = await this.npm("install", args)
  }

  async uninstall(args: string[] = []) {
    const result = await this.npm("uninstall", args)
  }

  async update(args: string[] = []) {
    const result = await this.npm("update", args)
  }

  async ls(args: string[] = []) {
    const result = await this.npm("ls", args)
  }

  async outdated(args: string[] = []) {
    const result = await this.npm("outdated", args)
  }

  async repo(args: string[] = []) {
    const result = await this.npm("repo", args)
  }
}