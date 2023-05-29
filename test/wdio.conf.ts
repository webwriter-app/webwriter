import os from "os"
import path from "path"
import { spawn, spawnSync } from "child_process"

let tauriDriver

export const config = {
  specs: ['./specs/**/*.js', "./specs/**/*.ts"],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      'tauri:options': {
        application: '../@webwriter/app-desktop/src-tauri/target/release',
      },
    },
  ],
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
  port: 4445,
  logLevel: "silent",

  onPrepare: () => {
    spawnSync('cargo', ['build', '--release'])
    tauriDriver = spawn(
      path.resolve(os.homedir(), '.cargo', 'bin', 'tauri-driver'),
      [],
      { stdio: [null, process.stdout, process.stderr] }
    )
  },

  onComplete: () => tauriDriver.kill(),
}