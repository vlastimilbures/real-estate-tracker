//! Where the app keeps its files, and the names the webview may give the ones it writes
//! there.

use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

use crate::error::AppError;

/// The database's file name in the app folder.
pub const DB_FILE: &str = "portfolio.db";

/// The SQL plugin connection the webview opens the database on (src/data/tauriSql.ts
/// `DB_URL`); the database commands run on its pool. The app has one database.
pub const DB_URL: &str = "sqlite:portfolio.db";

/// The app folder's subfolder for backups (ADR 0052): next to the database.
pub const BACKUPS_DIR: &str = "backups";

/// The app folder: the database, its backups and the window state.
pub fn app_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, AppError> {
    app.path().app_config_dir().map_err(AppError::other)
}

/// `<app folder>/backups`. Not created here: each caller reports a failure to create it
/// its own way.
pub fn backups_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, AppError> {
    Ok(app_dir(app)?.join(BACKUPS_DIR))
}

/// A webview string the app builds a file name from: 1 to `max` characters, each an
/// ASCII letter or digit, `-`, or one of `extra`, and no leading dot.
pub fn safe_file_stem(stem: &str, max: usize, extra: &[char]) -> bool {
    !stem.is_empty()
        && stem.len() <= max
        && !stem.starts_with('.')
        && stem
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || extra.contains(&c))
}

/// A safety backup's name, `<stem>.json`, 120 characters at most; the stem may hold dots
/// (`write_app_backup`).
pub fn valid_backup_name(name: &str) -> bool {
    name.len() <= 120
        && name
            .strip_suffix(".json")
            .is_some_and(|stem| safe_file_stem(stem, 115, &['.']))
}

/// A database backup's label, the stem of `<label>.sqlite` (`db_backup`): letters,
/// digits and `-`, 100 characters at most.
pub fn valid_label(label: &str) -> bool {
    safe_file_stem(label, 100, &[])
}
