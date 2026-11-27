//! The safety backup a restore or Clear sample writes into the app's backups folder.

use std::fs;
use tauri::AppHandle;

use crate::error::AppError;
use crate::fs_atomic::write_new_private;
use crate::paths::{backups_dir, valid_backup_name};

/// Write `json` to `<app-config>/backups/<filename>` (the database's own folder, ADR 0052)
/// through the verified temp-file write, 0600 (ADR 0080). An existing file of that name is
/// refused (`BACKUP_EXISTS`), never replaced. Async, so the write of a large backup never
/// runs on the main thread.
#[tauri::command]
pub async fn write_app_backup(
    app: AppHandle,
    filename: String,
    json: String,
) -> Result<(), AppError> {
    if !valid_backup_name(&filename) {
        return Err(AppError::InvalidBackupName(filename));
    }
    let dir = backups_dir(&app)?;
    fs::create_dir_all(&dir)?;
    write_new_private(&dir.join(&filename), json.as_bytes())
}
