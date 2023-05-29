#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use font_loader::system_fonts;

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs_extra::init())
//    .plugin(tauri_plugin_persisted_scope::init())
    .plugin(tauri_plugin_fs_watch::init())
    .invoke_handler(tauri::generate_handler![get_system_fonts])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
fn get_system_fonts() -> Vec<String> {
  return system_fonts::query_all();
}