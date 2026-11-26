//! Verified file writes: a new temp file in the target folder, read back and compared
//! before it is renamed over the target, so a crash or a failed check never leaves a
//! partial file (DR-139, DR-112, ADR 0175).

use std::fs;
use std::io::{ErrorKind, Read, Seek, Write};
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::private_fs::PRIVATE_FILE;

/// Write `data` to `dest` via a temp file in the same folder: the temp file is created
/// exclusively, fsynced and read back (it must hold exactly `data`), then renamed over
/// `dest`, and the folder is fsynced (best effort) so the rename survives a power loss. On
/// a failure before the rename the temp file is removed and `dest` is left as it was.
pub fn atomic_write(dest: &Path, data: &[u8]) -> Result<(), AppError> {
    write_via_temp(dest, data, None)
}

/// `atomic_write` for the app's own files (backups): created 0600, readable by the
/// user only (DR-157).
pub fn atomic_write_private(dest: &Path, data: &[u8]) -> Result<(), AppError> {
    write_via_temp(dest, data, Some(PRIVATE_FILE))
}

/// A new app file (a safety backup): `atomic_write_private`, but an existing file is
/// refused with `BACKUP_EXISTS` and left as it was, as `db_backup` does (ADR 0175). The
/// check runs before the write, so it is not atomic against a concurrent write of the
/// same name; the webview writes safety backups one at a time.
pub fn write_new_private(dest: &Path, data: &[u8]) -> Result<(), AppError> {
    if dest.exists() {
        return Err(AppError::BackupExists(dest.to_path_buf()));
    }
    atomic_write_private(dest, data)
}

/// Temp names tried before giving up (`.{name}.tmp-{pid}-{n}`).
const TEMP_TRIES: u32 = 100;

fn write_via_temp(dest: &Path, data: &[u8], mode: Option<u32>) -> Result<(), AppError> {
    let dir = dest
        .parent()
        .ok_or_else(|| AppError::NoFolder(dest.to_path_buf()))?;
    let name = dest
        .file_name()
        .ok_or_else(|| AppError::NoFileName(dest.to_path_buf()))?
        .to_string_lossy();
    let (tmp, file) = create_temp(dir, &name, mode)?;
    let written = fill_and_check(file, data).and_then(|()| Ok(fs::rename(&tmp, dest)?));
    if written.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    written?;
    // The file is in place. Some file systems a save may target (exFAT, network shares)
    // refuse a folder fsync; that must not report a written file as failed.
    sync_dir(dir);
    Ok(())
}

/// Create a new temp file next to the target. Never opens an existing file or follows
/// a symlink at the name (`O_EXCL`); a taken name moves on to the next counter.
fn create_temp(dir: &Path, name: &str, mode: Option<u32>) -> Result<(PathBuf, fs::File), AppError> {
    let pid = std::process::id();
    for n in 0..TEMP_TRIES {
        let tmp = dir.join(format!(".{name}.tmp-{pid}-{n}"));
        match create_new(&tmp, mode) {
            Ok(file) => return Ok((tmp, file)),
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(std::io::Error::new(ErrorKind::AlreadyExists, "no free temp file name").into())
}

/// Write `data`, fsync, then read the file back through the same handle: it must hold
/// exactly `data`.
fn fill_and_check(mut file: fs::File, data: &[u8]) -> Result<(), AppError> {
    file.write_all(data)?;
    file.sync_all()?;
    file.rewind()?;
    let mut back = Vec::with_capacity(data.len());
    file.read_to_end(&mut back)?;
    if back != data {
        return Err(AppError::SavedFileMismatch);
    }
    Ok(())
}

/// Create `path` exclusively (it must not exist) for reading and writing, with `mode`
/// when given (unix).
fn create_new(path: &Path, mode: Option<u32>) -> std::io::Result<fs::File> {
    let mut options = fs::OpenOptions::new();
    options.read(true).write(true).create_new(true);
    #[cfg(unix)]
    if let Some(m) = mode {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(m);
    }
    #[cfg(not(unix))]
    let _ = mode;
    options.open(path)
}

/// Fsync a folder, so a rename in it is on disk; best effort (unix; a no-op elsewhere).
fn sync_dir(dir: &Path) {
    #[cfg(unix)]
    let _ = fs::File::open(dir).and_then(|d| d.sync_all());
    #[cfg(not(unix))]
    let _ = dir;
}
