use tauri::image::Image;
use tauri::menu::{IconMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem};
use tauri::{Emitter, Manager};
#[cfg(target_os = "macos")]
use tauri::{RunEvent, WindowEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

pub mod db;
pub mod error;
pub mod files;
pub mod menu;
pub mod nav;
pub mod perf;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let started = perf::Started::now();
    tauri::Builder::default()
        .manage(started)
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
        .invoke_handler(tauri::generate_handler![
            db::db_transaction,
            db::db_select_snapshot,
            db::db_backup,
            db::log_error,
            perf::perf_report,
            files::save_file,
            files::open_backup_file,
            files::write_app_backup,
            menu::set_menu_labels
        ])
        .setup(|app| {
            // DR-157: the database, its backups and the window state are private (0600 in
            // a 0700 folder). Covers files from older versions; never fatal.
            match app.path().app_config_dir() {
                Ok(dir) => {
                    if let Err(e) = files::restrict_app_dir(&dir) {
                        log::warn!("could not make the app folder private: {e}");
                    }
                }
                Err(e) => log::warn!("no app folder to make private: {e}"),
            }
            // Native macOS menu: start from the OS default (keeps Edit/Window/Quit), drop the
            // predefined "About {app}" item (which opens an empty native popup) and replace it
            // with a custom "About…" that emits to the webview to open the in-app About page
            // (App.tsx listens for it).
            let menu = Menu::default(app.handle())?;
            // Our items, relabelled in the UI language by `set_menu_labels` (UX-076).
            let mut ours: Vec<MenuItemKind<tauri::Wry>> = Vec::new();
            let about = MenuItem::with_id(
                app,
                menu::ABOUT,
                "About Real Estate Tracker",
                true,
                None::<&str>,
            )?;
            // "Settings…" with the macOS-standard ⌘, accelerator. Emits to the webview to open
            // the in-app Settings page (App.tsx listens for menu://settings).
            let gear = Image::new_owned(
                include_bytes!("../icons/menu-settings@2x.rgba").to_vec(),
                32,
                32,
            );
            let settings = IconMenuItem::with_id(
                app,
                menu::SETTINGS,
                "Settings…",
                true,
                Some(gear),
                Some("CmdOrCtrl+,"),
            )?;
            if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
                // The app submenu's first item is the predefined About; remove it, then prepend
                // ours so the leading separator (now at index 0) keeps the native spacing.
                app_menu.remove_at(0)?;
                app_menu.prepend(&about)?;
                // Insert Settings just below the leading About + separator (index 2).
                app_menu.insert(&settings, 2)?;
            }
            ours.push(MenuItemKind::MenuItem(about));
            ours.push(MenuItemKind::Icon(settings));
            // UX-066 (DR-143): File ▸ New Property… (⌘N) and View ▸ pages (⌘1–⌘5), each
            // emitting to the webview like Settings (App.tsx listens).
            for item in menu.items()? {
                let MenuItemKind::Submenu(sub) = item else {
                    continue;
                };
                match sub.text()?.as_str() {
                    "File" => {
                        let new_property = MenuItem::with_id(
                            app,
                            menu::NEW_PROPERTY,
                            "New Property…",
                            true,
                            Some("CmdOrCtrl+N"),
                        )?;
                        sub.prepend(&PredefinedMenuItem::separator(app)?)?;
                        sub.prepend(&new_property)?;
                        ours.push(MenuItemKind::MenuItem(new_property));
                    }
                    "View" => {
                        sub.prepend(&PredefinedMenuItem::separator(app)?)?;
                        for (i, (route, label)) in menu::VIEW_PAGES.iter().enumerate().rev() {
                            let page = MenuItem::with_id(
                                app,
                                format!("{}{route}", menu::NAV_PREFIX),
                                *label,
                                true,
                                Some(format!("CmdOrCtrl+{}", i + 1).as_str()),
                            )?;
                            sub.prepend(&page)?;
                            ours.push(MenuItemKind::MenuItem(page));
                        }
                    }
                    _ => {}
                }
            }
            app.set_menu(menu)?;
            app.manage(menu::MenuItems(std::sync::Mutex::new(ours)));

            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == menu::ABOUT {
                let _ = app.emit("menu://about", ());
            } else if event.id() == menu::SETTINGS {
                let _ = app.emit("menu://settings", ());
            } else if let Some((name, payload)) = menu::webview_event(event.id().as_ref()) {
                let _ = app.emit(name, payload);
            }
        })
        // macOS convention (UX-045): ⌘W and the red close button hide the window instead of
        // quitting; clicking the Dock icon shows it again; ⌘Q (Quit) still exits.
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (window, event);
        })
        .build(tauri::generate_context!())
        // The only panic path: before any window exists there is nowhere to show an
        // error; tauri-plugin-log has already recorded the cause.
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
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
