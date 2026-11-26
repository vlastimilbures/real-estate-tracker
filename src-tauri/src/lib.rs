use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri::RunEvent;
use tauri::WindowEvent;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

pub mod commands;
pub mod crash;
pub mod db;
pub mod error;
pub mod error_log;
pub mod fs_atomic;
pub mod menu;
pub mod nav;
pub mod paths;
pub mod perf;
pub mod private_fs;

use commands::{backup, dialogs, reveal};

include!("command_list.rs");

/// Registers every listed command with the webview.
macro_rules! command_handler {
    ($($module:ident :: $command:ident),* $(,)?) => {
        tauri::generate_handler![$($module::$command),*]
    };
}

/// The app's own commands, as the webview calls them (src/command_list.rs).
pub fn command_names() -> &'static [&'static str] {
    app_commands!(command_names)
}

pub fn run() {
    crash::install_panic_hook();
    // ADR 0233: timing is on in a debug build, or when started with RTRACKER_PERF=1.
    // Read once here; the webview asks `perf_enabled` before its first render.
    let perf = perf::Perf::new(perf::enabled_from(
        std::env::var_os("RTRACKER_PERF").as_deref(),
        cfg!(debug_assertions),
    ));
    tauri::Builder::default()
        .manage(perf)
        .plugin(nav::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        // UX-065 (DR-142): reopen at the last size/position (and maximised state), kept in
        // `<app config>/.window-state.json`. Not VISIBLE: ⌘W hides the window (UX-045),
        // and the next launch must still show it.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        // Local error log (P5a): one rotating file in the OS log dir
        // (macOS: ~/Library/Logs/com.bures.realestate-tracker/app.log), 1 MB per file, the
        // five newest kept. Release builds record warnings and errors only; the webview
        // appends via the `log_error` command (codes and context, no financial values).
        .plugin(
            tauri_plugin_log::Builder::default()
                .clear_targets()
                .target(Target::new(TargetKind::LogDir {
                    file_name: Some("app".into()),
                }))
                .target(Target::new(TargetKind::Stdout))
                .max_file_size(1_000_000)
                .rotation_strategy(RotationStrategy::KeepSome(5))
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Info
                } else {
                    log::LevelFilter::Warn
                })
                .build(),
        )
        .invoke_handler(app_commands!(command_handler))
        .setup(|app| {
            // DR-157: the database, its backups and the window state are private (0600 in
            // a 0700 folder). Covers files from older versions; never fatal.
            match app.path().app_config_dir() {
                Ok(dir) => {
                    if let Err(e) = private_fs::restrict_app_dir(&dir) {
                        log::warn!("could not make the app folder private: {e}");
                    }
                }
                Err(e) => log::warn!("no app folder to make private: {e}"),
            }
            // ADR 0147: the error log is private too. The log plugin has opened app.log
            // by now; a file it rotates in later is made private at the next start.
            match app.path().app_log_dir() {
                Ok(dir) => {
                    if let Err(e) = private_fs::restrict_dir(&dir) {
                        log::warn!("could not make the log folder private: {e}");
                    }
                }
                Err(e) => log::warn!("no log folder to make private: {e}"),
            }
            menu::install(app)?;

            Ok(())
        })
        .on_menu_event(menu::on_event)
        // macOS convention (UX-045): ⌘W and the red close button hide the window instead of
        // quitting; clicking the Dock icon shows it again; ⌘Q (Quit) still exits.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        // `build()` fails only while creating the runtime or starting a plugin, before
        // tauri-plugin-log (registered last) is up, so this panic reaches stderr only.
        // A setup error (the menu above) does not come back here: Tauri runs `setup`
        // once the event loop is ready and panics with "Failed to setup app", which the
        // panic hook writes to app.log (ADR 0147).
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } = event
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            // `RunEvent::Reopen` is macOS-only in tauri; this arm keeps the Linux CI build
            // (clippy -D warnings) free of unused variables.
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
