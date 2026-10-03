//! Native menu shortcuts (UX-066, DR-143): which items exist and the webview event each
//! one sends. The menu is built in lib.rs; App.tsx turns the events into navigation.
//! The webview also sends the labels of these items in the UI language (UX-076).

use crate::error::AppError;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::sync::Mutex;
use tauri::menu::MenuItemKind;
use tauri::{State, Wry};

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
pub struct MenuItems(pub Mutex<Vec<MenuItemKind<Wry>>>);

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
