//! Native menu shortcuts (UX-066, DR-143): which items exist and the webview event each
//! one sends. The menu is built in lib.rs; App.tsx turns the events into navigation.
//! The webview also sends the labels of these items in the UI language (UX-076).

use crate::error::AppError;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{IconMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem};
use tauri::{App, Manager, Runtime, State, Wry};

/// App ▸ About… (opens the in-app About dialog).
pub const ABOUT: &str = "about";
/// App ▸ Settings… (⌘,).
pub const SETTINGS: &str = "settings";

/// File ▸ New Property… (⌘N).
pub const NEW_PROPERTY: &str = "new-property";
/// Id prefix of the View ▸ page items; the rest of the id is the page's route.
pub const NAV_PREFIX: &str = "nav:";
/// View ▸ pages in sidebar order; position n gets ⌘n.
pub const VIEW_PAGES: [(&str, &str); 5] = [
    ("dashboard", "Dashboard"),
    ("properties", "Properties"),
    ("projections", "Projections"),
    ("scenarios", "Scenarios"),
    ("import", "Import"),
];

/// The webview event (name, payload) for a menu item id, or None for items that are
/// not shortcuts (handled elsewhere or native).
pub fn webview_event(id: &str) -> Option<(&'static str, Option<&str>)> {
    if id == NEW_PROPERTY {
        return Some(("menu://new-property", None));
    }
    let route = id.strip_prefix(NAV_PREFIX)?;
    VIEW_PAGES
        .iter()
        .any(|(r, _)| *r == route)
        .then_some(("menu://navigate", Some(route)))
}

/// Longest label accepted from the webview, in characters.
pub const MAX_LABEL_CHARS: usize = 64;

/// Labels of the items above in the UI language, sent by the webview (UX-076). `pages`
/// is keyed by route and must name exactly the `VIEW_PAGES` routes.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MenuLabels {
    pub about: String,
    pub settings: String,
    pub new_property: String,
    pub pages: BTreeMap<String, String>,
}

fn valid(label: &str) -> bool {
    !label.trim().is_empty()
        && label.chars().count() <= MAX_LABEL_CHARS
        && !label.chars().any(char::is_control)
}

/// The (item id, new text) pairs for `labels`, or the first invalid field.
pub fn label_updates(labels: &MenuLabels) -> Result<Vec<(String, String)>, AppError> {
    let mut out = Vec::with_capacity(3 + VIEW_PAGES.len());
    for (id, field, label) in [
        (ABOUT, "about", &labels.about),
        (SETTINGS, "settings", &labels.settings),
        (NEW_PROPERTY, "newProperty", &labels.new_property),
    ] {
        if !valid(label) {
            return Err(AppError::InvalidMenuLabel(field));
        }
        out.push((id.to_string(), label.clone()));
    }
    if labels.pages.len() != VIEW_PAGES.len() {
        return Err(AppError::InvalidMenuLabel("pages"));
    }
    for (route, _) in VIEW_PAGES {
        match labels.pages.get(route) {
            Some(label) if valid(label) => {
                out.push((format!("{NAV_PREFIX}{route}"), label.clone()))
            }
            _ => return Err(AppError::InvalidMenuLabel("pages")),
        }
    }
    Ok(out)
}

/// Handles of the items this app adds to the menu, kept so their labels can change later
/// (`Menu::get` finds top-level items only).
pub struct MenuItems<R: Runtime = Wry>(pub Mutex<Vec<MenuItemKind<R>>>);

/// Relabel our menu items in the UI language (UX-076). Async, so it runs off the main
/// thread that the menu calls dispatch to.
#[tauri::command]
pub async fn set_menu_labels(
    items: State<'_, MenuItems>,
    labels: MenuLabels,
) -> Result<(), AppError> {
    let updates = label_updates(&labels)?;
    let items = items.0.lock().map_err(AppError::other)?.clone();
    for (id, text) in updates {
        let Some(item) = items.iter().find(|i| i.id() == id.as_str()) else {
            continue;
        };
        if let Some(m) = item.as_menuitem() {
            m.set_text(text).map_err(AppError::other)?;
        } else if let Some(m) = item.as_icon_menuitem() {
            m.set_text(text).map_err(AppError::other)?;
        }
    }
    Ok(())
}

/// Build the native menu and make it the app's (macOS): the OS default, with our items
/// added. Our item handles are kept for `set_menu_labels`.
pub fn install<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    // Native macOS menu: start from the OS default (keeps Edit/Window/Quit), drop the
    // predefined "About {app}" item (which opens an empty native popup) and replace it
    // with a custom "About…" that emits to the webview to open the in-app About page
    // (App.tsx listens for it).
    let menu = Menu::default(app.handle())?;
    // Our items, relabelled in the UI language by `set_menu_labels`.
    let mut ours: Vec<MenuItemKind<R>> = Vec::new();
    let about = MenuItem::with_id(app, ABOUT, "About Real Estate Tracker", true, None::<&str>)?;
    // "Settings…" with the macOS-standard ⌘, accelerator. Emits to the webview to open
    // the in-app Settings page (App.tsx listens for menu://settings).
    let gear = Image::new_owned(
        include_bytes!("../icons/menu-settings@2x.rgba").to_vec(),
        32,
        32,
    );
    let settings = IconMenuItem::with_id(
        app,
        SETTINGS,
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
    // File ▸ New Property… (⌘N) and View ▸ pages (⌘1–⌘5), each
    // emitting to the webview like Settings (App.tsx listens).
    for item in menu.items()? {
        let MenuItemKind::Submenu(sub) = item else {
            continue;
        };
        match sub.text()?.as_str() {
            "File" => {
                let new_property = MenuItem::with_id(
                    app,
                    NEW_PROPERTY,
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
                for (i, (route, label)) in VIEW_PAGES.iter().enumerate().rev() {
                    let page = MenuItem::with_id(
                        app,
                        format!("{}{route}", NAV_PREFIX),
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
    app.manage(MenuItems(Mutex::new(ours)));

    Ok(())
}
