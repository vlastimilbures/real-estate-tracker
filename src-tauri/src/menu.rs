//! The native macOS menu: the items this app adds, from one table (`ITEMS`), and the
//! webview event each one sends. The webview turns the events into navigation, and sends
//! the labels of these items in the UI language (`set_menu_labels`).

use crate::error::AppError;
use serde::Deserialize;
use std::collections::BTreeMap;
use tauri::image::Image;
use tauri::menu::{
    IconMenuItem, IsMenuItem, Menu, MenuEvent, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu,
    HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
};
use tauri::{App, AppHandle, Emitter, Manager, Runtime, State, Wry};

/// App ▸ About… (opens the in-app About dialog).
pub const ABOUT: &str = "about";
/// App ▸ Settings… (⌘,).
pub const SETTINGS: &str = "settings";
/// File ▸ New Property… (⌘N).
pub const NEW_PROPERTY: &str = "new-property";
/// Id prefix of the View ▸ page items; the rest of the id is the page's route.
pub const NAV_PREFIX: &str = "nav:";

/// The submenu an item of ours goes in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Parent {
    App,
    File,
    View,
}

/// One item this app adds to the menu.
#[derive(Debug)]
pub struct Item {
    pub id: &'static str,
    /// The webview event it sends; a View ▸ page's carries its route.
    pub event: &'static str,
    /// Its text until the webview sends the UI language's (`set_menu_labels`).
    pub default_label: &'static str,
    pub accelerator: Option<&'static str>,
    pub parent: Parent,
}

const fn page(id: &'static str, label: &'static str, accelerator: &'static str) -> Item {
    Item {
        id,
        event: "menu://navigate",
        default_label: label,
        accelerator: Some(accelerator),
        parent: Parent::View,
    }
}

/// Every item this app adds, in menu order within its submenu. View ▸ pages follow the
/// sidebar; position n gets ⌘n.
pub const ITEMS: [Item; 8] = [
    Item {
        id: ABOUT,
        event: "menu://about",
        default_label: "About Real Estate Tracker",
        accelerator: None,
        parent: Parent::App,
    },
    Item {
        id: SETTINGS,
        event: "menu://settings",
        default_label: "Settings…",
        accelerator: Some("CmdOrCtrl+,"),
        parent: Parent::App,
    },
    Item {
        id: NEW_PROPERTY,
        event: "menu://new-property",
        default_label: "New Property…",
        accelerator: Some("CmdOrCtrl+N"),
        parent: Parent::File,
    },
    page("nav:dashboard", "Dashboard", "CmdOrCtrl+1"),
    page("nav:properties", "Properties", "CmdOrCtrl+2"),
    page("nav:projections", "Projections", "CmdOrCtrl+3"),
    page("nav:scenarios", "Scenarios", "CmdOrCtrl+4"),
    page("nav:import", "Import", "CmdOrCtrl+5"),
];

/// The table entry for a menu item id, or None for a native item.
pub fn item(id: &str) -> Option<&'static Item> {
    ITEMS.iter().find(|i| i.id == id)
}

/// The routes of the View ▸ page items, in menu order.
pub fn view_routes() -> impl Iterator<Item = &'static str> {
    ITEMS.iter().filter_map(|i| i.id.strip_prefix(NAV_PREFIX))
}

/// The webview event (name, payload) for a menu item id, or None for a native item. A
/// View ▸ page sends its route, the id after `NAV_PREFIX`.
pub fn webview_event(id: &str) -> Option<(&'static str, Option<&'static str>)> {
    item(id).map(|i| (i.event, i.id.strip_prefix(NAV_PREFIX)))
}

/// Send the webview the event of the item clicked; native items do their own thing.
pub fn on_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if let Some((name, payload)) = webview_event(event.id().as_ref()) {
        let _ = app.emit(name, payload);
    }
}

/// Longest label accepted from the webview, in characters.
pub const MAX_LABEL_CHARS: usize = 64;

/// Labels of the items above in the UI language, sent by the webview. `pages` is keyed
/// by route and must name exactly the View ▸ page routes.
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
    let mut out = Vec::with_capacity(ITEMS.len());
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
    if labels.pages.len() != view_routes().count() {
        return Err(AppError::InvalidMenuLabel("pages"));
    }
    for route in view_routes() {
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
/// (`Menu::get` finds top-level items only). Set once, at setup.
pub struct MenuItems<R: Runtime = Wry>(pub Vec<MenuItemKind<R>>);

/// The menu item for a table entry: Settings carries the gear icon.
fn make<R: Runtime>(app: &AppHandle<R>, item: &Item) -> tauri::Result<MenuItemKind<R>> {
    if item.id == SETTINGS {
        let gear = Image::new_owned(
            include_bytes!("../icons/menu-settings@2x.rgba").to_vec(),
            32,
            32,
        );
        return Ok(MenuItemKind::Icon(IconMenuItem::with_id(
            app,
            item.id,
            item.default_label,
            true,
            Some(gear),
            item.accelerator,
        )?));
    }
    Ok(MenuItemKind::MenuItem(MenuItem::with_id(
        app,
        item.id,
        item.default_label,
        true,
        item.accelerator,
    )?))
}

/// The submenu items, in order, as trait objects.
fn refs<R: Runtime>(items: &[MenuItemKind<R>]) -> Vec<&dyn IsMenuItem<R>> {
    items.iter().map(|i| i as &dyn IsMenuItem<R>).collect()
}

/// The native menu: macOS's standard App, File, Edit, View, Window and Help menus, as
/// tauri's default builds them, with our items from `ITEMS` added; and the handles of ours.
/// About is ours (the predefined one opens an empty native panel), and so is Settings…,
/// just below it.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<(Menu<R>, MenuItems<R>)> {
    let ours = ITEMS
        .iter()
        .map(|i| make(app, i))
        .collect::<tauri::Result<Vec<_>>>()?;
    let of = |parent: Parent| -> Vec<MenuItemKind<R>> {
        ITEMS
            .iter()
            .zip(&ours)
            .filter(|(i, _)| i.parent == parent)
            .map(|(_, k)| k.clone())
            .collect()
    };
    let sep = || PredefinedMenuItem::separator(app).map(MenuItemKind::Predefined);
    let pre = |item: tauri::Result<PredefinedMenuItem<R>>| item.map(MenuItemKind::Predefined);

    let app_ours = of(Parent::App);
    let (about, settings) = (&app_ours[..1], &app_ours[1..]);
    let mut app_items = about.to_vec();
    app_items.push(sep()?);
    app_items.extend_from_slice(settings);
    app_items.extend([
        pre(PredefinedMenuItem::services(app, None))?,
        sep()?,
        pre(PredefinedMenuItem::hide(app, None))?,
        pre(PredefinedMenuItem::hide_others(app, None))?,
        sep()?,
        pre(PredefinedMenuItem::quit(app, None))?,
    ]);

    let mut file = of(Parent::File);
    file.extend([sep()?, pre(PredefinedMenuItem::close_window(app, None))?]);
    let edit = [
        pre(PredefinedMenuItem::undo(app, None))?,
        pre(PredefinedMenuItem::redo(app, None))?,
        sep()?,
        pre(PredefinedMenuItem::cut(app, None))?,
        pre(PredefinedMenuItem::copy(app, None))?,
        pre(PredefinedMenuItem::paste(app, None))?,
        pre(PredefinedMenuItem::select_all(app, None))?,
    ];
    let mut view = of(Parent::View);
    view.extend([sep()?, pre(PredefinedMenuItem::fullscreen(app, None))?]);
    let window = [
        pre(PredefinedMenuItem::minimize(app, None))?,
        pre(PredefinedMenuItem::maximize(app, None))?,
        sep()?,
        pre(PredefinedMenuItem::close_window(app, None))?,
    ];

    let name = app.package_info().name.clone();
    let menu = Menu::with_items(
        app,
        &[
            &Submenu::with_items(app, name, true, &refs(&app_items))?,
            &Submenu::with_items(app, "File", true, &refs(&file))?,
            &Submenu::with_items(app, "Edit", true, &refs(&edit))?,
            &Submenu::with_items(app, "View", true, &refs(&view))?,
            &Submenu::with_id_and_items(app, WINDOW_SUBMENU_ID, "Window", true, &refs(&window))?,
            &Submenu::with_id_and_items(app, HELP_SUBMENU_ID, "Help", true, &[])?,
        ],
    )?;
    Ok((menu, MenuItems(ours)))
}

/// Build the native menu and make it the app's; keep our item handles for
/// `set_menu_labels`.
pub fn install<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let (menu, ours) = build(app.handle())?;
    app.set_menu(menu)?;
    app.manage(ours);
    Ok(())
}

/// Relabel our menu items in the UI language. Async, so it runs off the main thread that
/// the menu calls dispatch to.
#[tauri::command]
pub async fn set_menu_labels(
    items: State<'_, MenuItems>,
    labels: MenuLabels,
) -> Result<(), AppError> {
    for (id, text) in label_updates(&labels)? {
        let Some(item) = items.0.iter().find(|i| i.id() == id.as_str()) else {
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
