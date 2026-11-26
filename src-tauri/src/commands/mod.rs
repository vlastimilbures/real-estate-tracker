//! The webview's file commands (P8, D-64): Rust opens the native dialogs itself, so the
//! webview never hands Rust a file path and needs no fs or dialog permission.

pub mod backup;
pub mod dialogs;
pub mod reveal;
