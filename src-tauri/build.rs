// ADR 0064: the app's own commands are listed in an app manifest, so the webview may
// call one only when capabilities/default.json grants its `allow-*` permission. The list
// is src/command_list.rs, shared with the handler registration in lib.rs.
include!("src/command_list.rs");

fn main() {
    // tauri-build declares the files it watches, which turns off Cargo's default of
    // rerunning on any change: the list is included here, so it must be declared too.
    println!("cargo:rerun-if-changed=src/command_list.rs");
    let commands: &[&str] = app_commands!(command_names);
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .expect("failed to run tauri-build");
}
