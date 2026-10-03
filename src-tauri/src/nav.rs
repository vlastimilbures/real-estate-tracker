//! Navigation guard (P8): the webview may only show the app's own pages. Any other
//! navigation — a remote site, `mailto:`, a file URL — is refused, so a stray link or
//! injected script cannot take the window off the app.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Runtime, Url};

/// The dev server URL (`build.devUrl` in tauri.conf.json), allowed in debug builds only.
const DEV_ORIGIN: &str = "http://localhost:1420";

/// True for the app's own origin: `tauri://localhost` (macOS/Linux) or
/// `http(s)://tauri.localhost` (Windows); plus the Vite dev server when `dev`.
pub fn is_app_url(url: &Url, dev: bool) -> bool {
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "http" | "https" if url.host_str() == Some("tauri.localhost") => true,
        _ => dev && url.origin().ascii_serialization() == DEV_ORIGIN,
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("navigation-guard")
        .on_navigation(|_, url| {
            let allowed = is_app_url(url, cfg!(debug_assertions));
            if !allowed {
                log::warn!(target: "app", "NAVIGATION_BLOCKED {}", url.scheme());
            }
            allowed
        })
        .build()
}
