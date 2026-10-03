//! UX-066: the menu shortcut ids map to the events App.tsx listens for.

use app_lib::menu::{
    label_updates, webview_event, MenuLabels, ABOUT, MAX_LABEL_CHARS, NAV_PREFIX, NEW_PROPERTY,
    SETTINGS, VIEW_PAGES,
};

#[test]
fn new_property_and_pages_map_to_webview_events() {
    assert_eq!(
        webview_event(NEW_PROPERTY),
        Some(("menu://new-property", None))
    );
    for (route, _) in VIEW_PAGES {
        let id = format!("{NAV_PREFIX}{route}");
        assert_eq!(webview_event(&id), Some(("menu://navigate", Some(route))));
    }
}

#[test]
fn view_lists_the_sidebar_pages_in_order() {
    let routes: Vec<&str> = VIEW_PAGES.iter().map(|(r, _)| *r).collect();
    assert_eq!(
        routes,
        [
            "dashboard",
            "properties",
            "projections",
            "scenarios",
            "import"
        ]
    );
}

#[test]
fn other_ids_are_not_shortcuts() {
    for id in ["about", "settings", "nav:settings", "nav:", "dashboard", ""] {
        assert_eq!(webview_event(id), None, "{id}");
    }
}

// UX-076 (DR-155): the webview sends the labels of our menu items in the UI language.

fn labels(json: &str) -> Result<MenuLabels, serde_json::Error> {
    serde_json::from_str(json)
}

const CS: &str = r#"{
    "about": "O aplikaci Real Estate Tracker",
    "settings": "Nastavení…",
    "newProperty": "Nová nemovitost…",
    "pages": {
        "dashboard": "Přehled",
        "properties": "Nemovitosti",
        "projections": "Projekce",
        "scenarios": "Scénáře",
        "import": "Import"
    }
}"#;

#[test]
fn labels_update_every_item_we_add() {
    let updates = label_updates(&labels(CS).unwrap()).unwrap();
    let mut ids: Vec<&str> = updates.iter().map(|(id, _)| id.as_str()).collect();
    ids.sort_unstable();
    let mut want = vec![ABOUT.to_string(), SETTINGS.into(), NEW_PROPERTY.into()];
    want.extend(VIEW_PAGES.iter().map(|(r, _)| format!("{NAV_PREFIX}{r}")));
    want.sort_unstable();
    assert_eq!(ids, want);
    assert!(updates.contains(&(SETTINGS.to_string(), "Nastavení…".to_string())));
    assert!(updates.contains(&("nav:scenarios".to_string(), "Scénáře".to_string())));
}

#[test]
fn rejects_a_blank_long_or_control_label() {
    let long = "x".repeat(MAX_LABEL_CHARS + 1);
    for bad in ["", "   ", "a\nb", long.as_str()] {
        let mut json: serde_json::Value = serde_json::from_str(CS).unwrap();
        json["settings"] = bad.into();
        let parsed: MenuLabels = serde_json::from_value(json).unwrap();
        let err = label_updates(&parsed).unwrap_err();
        assert_eq!(err.to_string(), "invalid menu label: settings", "{bad:?}");
    }
}

#[test]
fn rejects_missing_or_unknown_pages() {
    let missing = CS.replace(r#""import": "Import""#, r#""extra": "X""#);
    let err = label_updates(&labels(&missing).unwrap()).unwrap_err();
    assert_eq!(err.to_string(), "invalid menu label: pages");
    assert!(labels(&CS.replace("\"about\"", "\"aboutX\"")).is_err());
}
