//! The save and open dialogs: exports, and the backup file a restore reads.

use serde::{Deserialize, Serialize};
use std::fs;
use tauri::ipc::{InvokeBody, Request};
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;

use crate::error::AppError;
use crate::fs_atomic::atomic_write;

/// Header carrying the save-dialog options (percent-encoded JSON) next to the raw body.
const SAVE_OPTIONS_HEADER: &str = "x-save-options";

/// Decode `%XX` escapes (what JS `encodeURIComponent` produces) into UTF-8 text.
pub fn percent_decode(s: &str) -> Result<String, AppError> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = s
                .get(i + 1..i + 3)
                .and_then(|h| u8::from_str_radix(h, 16).ok())
                .ok_or(AppError::InvalidPercentEscape)?;
            out.push(hex);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(AppError::other)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveOptions {
    filename: String,
    filter_name: String,
    extensions: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SaveOutcome {
    Saved { filename: String },
    Cancelled,
}

fn save_options(request: &Request<'_>) -> Result<SaveOptions, AppError> {
    let header = request
        .headers()
        .get(SAVE_OPTIONS_HEADER)
        .ok_or(AppError::MissingHeader(SAVE_OPTIONS_HEADER))?
        .to_str()
        .map_err(AppError::other)?;
    serde_json::from_str(&percent_decode(header)?).map_err(AppError::other)
}

/// Ask where to save (native save dialog over `window`), then write the raw request body
/// there and verify it. A closed dialog is `Cancelled`.
#[tauri::command]
pub async fn save_file(
    window: WebviewWindow,
    request: Request<'_>,
) -> Result<SaveOutcome, AppError> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err(AppError::ExpectedRawBody);
    };
    let opts = save_options(&request)?;
    let extensions: Vec<&str> = opts.extensions.iter().map(String::as_str).collect();
    let picked = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_file_name(&opts.filename)
        .add_filter(&opts.filter_name, &extensions)
        .blocking_save_file();
    let Some(picked) = picked else {
        return Ok(SaveOutcome::Cancelled);
    };
    let path = picked.into_path().map_err(AppError::other)?;
    atomic_write(&path, data)?;
    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(SaveOutcome::Saved { filename })
}

#[derive(Debug, Serialize)]
pub struct OpenedFile {
    name: String,
    text: String,
}

/// Ask for a backup JSON file (native open dialog over `window`) and return its name and
/// text, or `None` when the dialog is closed. A file over `max_bytes` is refused with
/// `BACKUP_TOO_LARGE` before it is read (DR-138). Invalid UTF-8 is replaced, as the fs
/// plugin's text read did, so it surfaces as "not a JSON backup".
#[tauri::command]
pub async fn open_backup_file(
    window: WebviewWindow,
    max_bytes: u64,
) -> Result<Option<OpenedFile>, AppError> {
    let picked = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("JSON backup", &["json"])
        .blocking_pick_file();
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(AppError::other)?;
    if fs::metadata(&path)?.len() > max_bytes {
        return Err(AppError::BackupTooLarge);
    }
    let bytes = fs::read(&path)?;
    Ok(Some(OpenedFile {
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        text: String::from_utf8_lossy(&bytes).into_owned(),
    }))
}
