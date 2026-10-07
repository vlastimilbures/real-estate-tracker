//! File IO for the webview (P8, D-64): exports, backup restore picks and the pre-restore
//! safety backup.
//!
//! Rust opens the native dialogs itself, so the webview never hands Rust a file path and
//! needs no fs or dialog permission. Writes go to a temp file in the target folder,
//! then rename over the target (a crash mid-write never leaves a partial file, DR-139),
//! and are read back and compared before reporting success (DR-112).

use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::Command;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::error::AppError;

/// Header carrying the save-dialog options (percent-encoded JSON) next to the raw body.
const SAVE_OPTIONS_HEADER: &str = "x-save-options";

/// Write `data` to `dest` via a temp file in the same folder, fsync it, then rename it
/// over `dest`. On failure the temp file is removed and `dest` is left as it was.
pub fn atomic_write(dest: &Path, data: &[u8]) -> Result<(), AppError> {
    write_via_temp(dest, data, None)
}

/// `atomic_write` for the app's own files (backups): created 0600, readable by the
/// user only (DR-157).
pub fn atomic_write_private(dest: &Path, data: &[u8]) -> Result<(), AppError> {
    write_via_temp(dest, data, Some(PRIVATE_FILE))
}

/// Mode of the app's own files and folders (DR-157): user only.
const PRIVATE_FILE: u32 = 0o600;
const PRIVATE_DIR: u32 = 0o700;

fn write_via_temp(dest: &Path, data: &[u8], mode: Option<u32>) -> Result<(), AppError> {
    let dir = dest
        .parent()
        .ok_or_else(|| AppError::NoFolder(dest.to_path_buf()))?;
    let name = dest
        .file_name()
        .ok_or_else(|| AppError::NoFileName(dest.to_path_buf()))?
        .to_string_lossy();
    let tmp = dir.join(format!(".{name}.tmp-{}", std::process::id()));
    let written = create_new(&tmp, mode)
        .and_then(|mut f| {
            f.write_all(data)?;
            f.sync_all()
        })
        .and_then(|()| fs::rename(&tmp, dest));
    if let Err(e) = written {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

/// Create (or truncate) `path` for writing, with `mode` when given (unix).
fn create_new(path: &Path, mode: Option<u32>) -> std::io::Result<fs::File> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    if let Some(m) = mode {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(m);
    }
    #[cfg(not(unix))]
    let _ = mode;
    options.open(path)
}

/// Make the app's folder private (DR-157): the folder and its `backups/` become 0700 and
/// every regular file in them 0600 (database, its -wal/-shm, backups, window state).
/// Symlinks are skipped. A folder that does not exist yet is left alone. Run at
/// start-up, so files created before this version (or by plugins) are covered too.
pub fn restrict_app_dir(dir: &Path) -> Result<(), AppError> {
    if !dir.is_dir() {
        return Ok(());
    }
    restrict_dir(dir)?;
    restrict_dir(&dir.join("backups"))
}

/// Make one folder private: 0700, and every regular file directly in it 0600. Symlinks
/// and subfolders are skipped; a folder that does not exist is left alone. Also used for
/// the error log's folder (ADR 0147).
pub fn restrict_dir(folder: &Path) -> Result<(), AppError> {
    if !folder.is_dir() {
        return Ok(());
    }
    set_mode(folder, PRIVATE_DIR)?;
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        // `file_type` does not follow symlinks.
        if entry.file_type()?.is_file() {
            restrict_file(&entry.path())?;
        }
    }
    Ok(())
}

/// Make one of the app's files private (0600, DR-157).
pub fn restrict_file(path: &Path) -> Result<(), AppError> {
    set_mode(path, PRIVATE_FILE)
}

#[cfg(unix)]
fn set_mode(path: &Path, mode: u32) -> Result<(), AppError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode)).map_err(AppError::from)
}

#[cfg(not(unix))]
fn set_mode(_path: &Path, _mode: u32) -> Result<(), AppError> {
    Ok(())
}

/// `atomic_write`, then read the file back: it must hold exactly `data`.
pub fn write_verified(dest: &Path, data: &[u8]) -> Result<(), AppError> {
    atomic_write(dest, data)?;
    let back = fs::read(dest)?;
    if back != data {
        return Err(AppError::SavedFileMismatch);
    }
    Ok(())
}

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

/// Only `[A-Za-z0-9.-]`, no leading dot, ending in `.json` — the name becomes a file in
/// the app's own backups folder.
pub fn valid_backup_name(name: &str) -> bool {
    name.len() <= 120
        && !name.starts_with('.')
        && name.ends_with(".json")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
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
    write_verified(&path, data)?;
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

/// Write `json` to `<app-config>/backups/<filename>` (the database's own folder, D-52)
/// via temp file + rename, 0600 (DR-157), and return what reads back, for the caller to
/// verify.
#[tauri::command]
pub fn write_app_backup(
    app: AppHandle,
    filename: String,
    json: String,
) -> Result<String, AppError> {
    if !valid_backup_name(&filename) {
        return Err(AppError::InvalidBackupName(filename));
    }
    let dir = app
        .path()
        .app_config_dir()
        .map_err(AppError::other)?
        .join("backups");
    fs::create_dir_all(&dir)?;
    let path = dir.join(&filename);
    atomic_write_private(&path, json.as_bytes())?;
    fs::read_to_string(&path).map_err(AppError::from)
}

/// The database's file name in the app folder (`sqlite:portfolio.db`, src/data/tauriSql.ts).
const DB_FILE: &str = "portfolio.db";

/// The `open` arguments that show `dir` in Finder: the database selected when it is
/// there, else the folder itself. Each path is one argument; no shell is involved.
pub fn reveal_args(dir: &Path) -> Result<Vec<OsString>, AppError> {
    if !dir.is_dir() {
        return Err(AppError::NoFolder(dir.to_path_buf()));
    }
    let db = dir.join(DB_FILE);
    Ok(if db.is_file() {
        vec![OsString::from("-R"), db.into_os_string()]
    } else {
        vec![dir.as_os_str().to_os_string()]
    })
}

/// Show the app folder (database and `backups/`) in Finder, for the startup error screen
/// (#115, ADR 0153). Takes nothing from the webview: the folder is the app's own. Async,
/// and `open` waits on a blocking worker, so the main thread never waits for Finder.
#[tauri::command]
pub async fn reveal_data_dir(app: AppHandle) -> Result<(), AppError> {
    let dir = app.path().app_config_dir().map_err(AppError::other)?;
    let args = reveal_args(&dir)?;
    let status = tauri::async_runtime::spawn_blocking(move || {
        Command::new("/usr/bin/open").args(args).status()
    })
    .await
    .map_err(AppError::other)??;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::Other(format!("open exited with {status}")))
    }
}
