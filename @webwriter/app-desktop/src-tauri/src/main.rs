#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri_plugin_fs_extra::FsExtra;

fn main() {
  println!("cargo:rerun-if-changed=dist");
  tauri::Builder::default()
    .plugin(FsExtra::default())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
