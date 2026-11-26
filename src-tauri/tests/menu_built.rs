//! The native menu as macOS shows it: every item, in order, with its title and its key
//! equivalent (accelerator). Built by the real `menu::install` on tauri's mock runtime,
//! with no app launched and no window, then read back from `NSApp.mainMenu`. A Tauri
//! update that reorders the default menu, or a change that loses one of our items or its
//! accelerator, fails here instead of at run time.
//!
//! `harness = false` (Cargo.toml): AppKit makes menus on the process's main thread only.

#[cfg(target_os = "macos")]
fn main() {
    let got = dump();
    let want: Vec<&str> = include_str!("menu_built.txt").lines().collect();
    if got != want {
        eprintln!("--- built menu ---");
        for line in &got {
            eprintln!("{line}");
        }
        panic!("the built menu differs from tests/menu_built.txt");
    }
    println!("menu_built: {} lines match", got.len());
}

#[cfg(not(target_os = "macos"))]
fn main() {}

/// One line per item: indent per level, `---` for a separator, else the title, `(icon)`
/// when it has one, and its key equivalent as `[⌘⇧⌥⌃]key`. The process name macOS puts
/// in Hide and Quit (this test binary's) reads `{process}`.
#[cfg(target_os = "macos")]
fn dump() -> Vec<String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSApplication;

    // The app object exists before setup in the real app (the event loop makes it), and
    // the standard items read the app's name from it.
    let mtm = MainThreadMarker::new().expect("runs on the main thread");
    let ns_app = NSApplication::sharedApplication(mtm);
    let app = tauri::test::mock_app();
    app_lib::menu::install(&app).expect("menu installs");
    let menu = ns_app.mainMenu().expect("the app menu is set");
    let process = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_stem().map(|s| s.to_string_lossy().into_owned()))
        .unwrap_or_default();
    let mut out = Vec::new();
    walk(&menu, 0, &mut out);
    out.into_iter()
        .map(|l| l.replace(&process, "{process}"))
        .collect()
}

#[cfg(target_os = "macos")]
fn walk(menu: &objc2_app_kit::NSMenu, depth: usize, out: &mut Vec<String>) {
    use objc2_app_kit::NSEventModifierFlags as M;

    let indent = "  ".repeat(depth);
    for item in menu.itemArray().iter() {
        if item.isSeparatorItem() {
            out.push(format!("{indent}---"));
            continue;
        }
        let key = item.keyEquivalent().to_string();
        let shortcut = if key.is_empty() {
            String::new()
        } else {
            let mask = item.keyEquivalentModifierMask();
            let mut s = String::from(" [");
            for (flag, sign) in [
                (M::Command, "⌘"),
                (M::Shift, "⇧"),
                (M::Option, "⌥"),
                (M::Control, "⌃"),
            ] {
                if mask.contains(flag) {
                    s.push_str(sign);
                }
            }
            s.push_str(&key.escape_default().to_string());
            s.push(']');
            s
        };
        let icon = if item.image().is_some() {
            " (icon)"
        } else {
            ""
        };
        out.push(format!("{indent}{}{icon}{shortcut}", item.title()));
        if let Some(sub) = item.submenu() {
            walk(&sub, depth + 1, out);
        }
    }
}
