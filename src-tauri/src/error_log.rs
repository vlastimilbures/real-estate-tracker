//! The webview's line in the local error log (`app.log`, ADR 0147).

/// Append one structured error line to the local log. The caller sends a
/// code and non-financial context only; both are length-capped here.
#[tauri::command]
pub fn log_error(code: String, context: String) {
    let cap = |s: &str, n: usize| s.chars().take(n).collect::<String>();
    log::error!(target: "app", "{} {}", cap(&code, 80), cap(&context, 500));
}
