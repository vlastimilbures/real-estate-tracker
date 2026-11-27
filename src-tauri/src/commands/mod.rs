//! The webview's file commands (ADR 0064): Rust opens the native dialogs itself, so the
//! webview never hands Rust a file path and needs no fs or dialog permission.

pub mod backup;
pub mod dialogs;
pub mod reveal;
