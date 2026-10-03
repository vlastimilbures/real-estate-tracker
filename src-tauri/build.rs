// P8 (D-64): the app's own commands are listed in an app manifest, so the webview may
// call one only when capabilities/default.json grants its `allow-*` permission.
fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "db_transaction",
            "db_select_snapshot",
            "db_backup",
            "log_error",
            "perf_report",
            "save_file",
            "open_backup_file",
            "write_app_backup",
            "set_menu_labels",
        ]),
    ))
    .expect("failed to run tauri-build");
}
