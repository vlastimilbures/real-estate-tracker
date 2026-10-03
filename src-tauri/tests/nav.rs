//! P8: the navigation guard allows only the app's own pages.

use app_lib::nav::is_app_url;
use tauri::Url;

fn url(s: &str) -> Url {
    Url::parse(s).unwrap()
}

#[test]
fn app_pages_are_allowed() {
    assert!(is_app_url(&url("tauri://localhost/index.html"), false));
    assert!(is_app_url(&url("http://tauri.localhost/"), false));
}

#[test]
fn remote_and_other_schemes_are_refused() {
    for u in [
        "https://github.com/vlastimilbures/real-estate-tracker",
        "http://example.com/",
        "mailto:someone@example.com",
        "file:///etc/passwd",
        "tauri://evil.example/",
        "http://tauri.localhost.example.com/",
    ] {
        assert!(!is_app_url(&url(u), false), "{u}");
        assert!(!is_app_url(&url(u), true), "{u}");
    }
}

#[test]
fn the_dev_server_is_allowed_only_in_dev() {
    assert!(is_app_url(&url("http://localhost:1420/"), true));
    assert!(!is_app_url(&url("http://localhost:1420/"), false));
    assert!(!is_app_url(&url("http://localhost:1421/"), true));
}
