//! Show the app folder in Finder.

use std::ffi::OsString;
use std::path::Path;
use std::process::Command;
use tauri::AppHandle;

use crate::error::AppError;
use crate::paths::{app_dir, DB_FILE};

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
/// (ADR 0153). Takes nothing from the webview: the folder is the app's own. Async,
/// and `open` waits on a blocking worker, so the main thread never waits for Finder.
#[tauri::command]
pub async fn reveal_data_dir(app: AppHandle) -> Result<(), AppError> {
    let dir = app_dir(&app)?;
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
