// The app's own commands, listed once. `app_commands!(callback)` hands the list, as
// `module::command` paths, to `callback`:
//   - build.rs `include!`s this file to put each name in the app manifest, so the webview
//     may call a command only when capabilities/default.json grants its `allow-*`;
//   - lib.rs registers each one with `tauri::generate_handler!`;
//   - `command_names()` (lib.rs) gives the names to tests/commands.rs, which checks the
//     grants, and src/platform/__tests__/commands.test.ts checks this list against the
//     webview's typed map (src/platform/commands.ts).
// Adding a command: add it here, to the typed map and to the capability file.
macro_rules! app_commands {
    ($callback:ident) => {
        $callback! {
            db::db_transaction,
            db::db_select_snapshot,
            db::db_backup,
            db::log_error,
            perf::perf_enabled,
            perf::perf_report,
            files::save_file,
            files::open_backup_file,
            files::write_app_backup,
            files::reveal_data_dir,
            menu::set_menu_labels,
        }
    };
}

/// The commands' names, as the webview calls them.
macro_rules! command_names {
    ($($module:ident :: $command:ident),* $(,)?) => {
        &[$(stringify!($command)),*]
    };
}
