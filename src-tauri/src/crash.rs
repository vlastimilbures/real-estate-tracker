//! Panics reach the error log (ADR 0147). Stderr is discarded when the app is opened from
//! Finder, so without this a panic left `app.log` empty although the bug form points there.

use std::any::Any;
use std::panic::Location;

/// The text a panic was raised with: `panic!("…")` gives a `&str` or a `String`.
pub fn panic_text(payload: &(dyn Any + Send)) -> &str {
    if let Some(s) = payload.downcast_ref::<&str>() {
        s
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s
    } else {
        "a panic without a message"
    }
}

/// The log line for a panic: `PANIC <message> at <file>:<line>`. Takes the hook info's
/// parts, so it does not name the hook info type (renamed after the crate's MSRV).
pub fn panic_line(payload: &(dyn Any + Send), location: Option<&Location<'_>>) -> String {
    let at = location
        .map(|l| format!(" at {}:{}", l.file(), l.line()))
        .unwrap_or_default();
    format!("PANIC {}{at}", panic_text(payload))
}

/// Log every panic through `log` (tauri-plugin-log writes it to `app.log` once the plugin
/// has started; before that the line goes nowhere), then run the previous hook, which
/// prints to stderr as before.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!(target: "app", "{}", panic_line(info.payload(), info.location()));
        log::logger().flush();
        previous(info);
    }));
}
