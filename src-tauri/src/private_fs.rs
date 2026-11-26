//! The app's own files and folders are readable by the user only (DR-157): 0600 files in
//! 0700 folders.

use std::fs;
use std::path::Path;

use crate::error::AppError;
use crate::paths::BACKUPS_DIR;

/// Mode of the app's own files and folders (DR-157): user only.
pub const PRIVATE_FILE: u32 = 0o600;
const PRIVATE_DIR: u32 = 0o700;

/// Make the app's folder private (DR-157): the folder and its `backups/` become 0700 and
/// every regular file in them 0600 (database, its -wal/-shm, backups, window state).
/// Symlinks are skipped. A folder that does not exist yet is left alone. Run at
/// start-up, so files created before this version (or by plugins) are covered too.
pub fn restrict_app_dir(dir: &Path) -> Result<(), AppError> {
    if !dir.is_dir() {
        return Ok(());
    }
    restrict_dir(dir)?;
    restrict_dir(&dir.join(BACKUPS_DIR))
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

fn set_mode(path: &Path, mode: u32) -> Result<(), AppError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode)).map_err(AppError::from)
}
