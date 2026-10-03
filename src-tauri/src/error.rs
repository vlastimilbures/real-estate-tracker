//! The one error type of the Tauri commands (DR-173).
//!
//! Each failure is a typed variant, but it crosses the IPC boundary as the same plain
//! string the commands returned before: `Serialize` writes the `Display` text, and the
//! webview matches on it (`BACKUP_*` codes, `FOREIGN_KEY_CHECK_FAILED`, and SQLite's own
//! constraint messages, passed through verbatim for `constraintOf`). Changing a `Display`
//! arm is therefore a user-visible change.

use serde::{Serialize, Serializer};
use std::fmt;
use std::path::PathBuf;

#[derive(Debug)]
pub enum AppError {
    /// An sqlx / SQLite error, verbatim.
    Sql(String),
    /// A file-system error, verbatim.
    Io(String),
    /// Any other library error (paths, dialogs, headers, JSON), verbatim.
    Other(String),
    /// A statement parameter that is not null, string, bool or number.
    UnsupportedParam(String),
    /// A column type the plugin-compatible decoder does not handle.
    UnsupportedDatatype(String),
    /// `PRAGMA foreign_key_check` returned this many rows.
    ForeignKeyCheck(usize),
    /// No SQLite pool is loaded under this name.
    DbNotLoaded(String),
    /// A backup label outside `[A-Za-z0-9-]`.
    InvalidLabel(String),
    /// A backup file name outside `[A-Za-z0-9.-]…\.json`.
    InvalidBackupName(String),
    BackupExists(PathBuf),
    BackupPathNotUtf8,
    BackupFailed(String),
    BackupUnreadable(String),
    BackupCorrupt(String),
    BackupMismatch,
    BackupTooLarge,
    NoFolder(PathBuf),
    NoFileName(PathBuf),
    /// The file read back after a write differs from what was written.
    SavedFileMismatch,
    MissingHeader(&'static str),
    InvalidPercentEscape,
    ExpectedRawBody,
    /// A menu label from the webview that is blank, too long or holds a control character.
    InvalidMenuLabel(&'static str),
}

impl AppError {
    /// Wrap any library error as `Other`, keeping its message.
    pub fn other(e: impl fmt::Display) -> Self {
        Self::Other(e.to_string())
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sql(m) | Self::Io(m) | Self::Other(m) => f.write_str(m),
            Self::UnsupportedParam(v) => write!(f, "unsupported parameter type: {v}"),
            Self::UnsupportedDatatype(t) => write!(f, "unsupported datatype: {t}"),
            Self::ForeignKeyCheck(n) => write!(f, "FOREIGN_KEY_CHECK_FAILED: {n} row(s)"),
            Self::DbNotLoaded(db) => write!(f, "database not loaded: {db}"),
            Self::InvalidLabel(l) => write!(f, "invalid backup label: {l}"),
            Self::InvalidBackupName(n) => write!(f, "invalid backup file name: {n}"),
            Self::BackupExists(p) => write!(f, "BACKUP_EXISTS: {}", p.display()),
            Self::BackupPathNotUtf8 => f.write_str("BACKUP_PATH_NOT_UTF8"),
            Self::BackupFailed(m) => write!(f, "BACKUP_FAILED: {m}"),
            Self::BackupUnreadable(m) => write!(f, "BACKUP_UNREADABLE: {m}"),
            Self::BackupCorrupt(c) => write!(f, "BACKUP_CORRUPT: {c}"),
            Self::BackupMismatch => f.write_str("BACKUP_MISMATCH: row counts differ"),
            Self::BackupTooLarge => f.write_str("BACKUP_TOO_LARGE"),
            Self::NoFolder(p) => write!(f, "no folder for {}", p.display()),
            Self::NoFileName(p) => write!(f, "no file name in {}", p.display()),
            Self::SavedFileMismatch => f.write_str("the saved file does not match"),
            Self::MissingHeader(h) => write!(f, "missing {h} header"),
            Self::InvalidPercentEscape => f.write_str("invalid percent escape"),
            Self::ExpectedRawBody => f.write_str("expected the file contents as raw bytes"),
            Self::InvalidMenuLabel(field) => write!(f, "invalid menu label: {field}"),
        }
    }
}

impl std::error::Error for AppError {}

/// On the wire an `AppError` is its `Display` string, as before DR-173.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.collect_str(self)
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        Self::Sql(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::AppError::{self, *};
    use std::path::PathBuf;

    /// Every variant keeps the exact string the commands returned before DR-173.
    #[test]
    fn display_matches_the_pre_dr173_strings() {
        let p = PathBuf::from("/tmp/b/x.sqlite");
        let cases: Vec<(AppError, &str)> = vec![
            (
                Sql("UNIQUE constraint failed: t.a".into()),
                "UNIQUE constraint failed: t.a",
            ),
            (
                Io("No such file or directory (os error 2)".into()),
                "No such file or directory (os error 2)",
            ),
            (Other("boom".into()), "boom"),
            (
                UnsupportedParam("[1]".into()),
                "unsupported parameter type: [1]",
            ),
            (
                UnsupportedDatatype("DATE".into()),
                "unsupported datatype: DATE",
            ),
            (ForeignKeyCheck(2), "FOREIGN_KEY_CHECK_FAILED: 2 row(s)"),
            (
                DbNotLoaded("sqlite:x.db".into()),
                "database not loaded: sqlite:x.db",
            ),
            (InvalidLabel("a b".into()), "invalid backup label: a b"),
            (
                InvalidBackupName("x.txt".into()),
                "invalid backup file name: x.txt",
            ),
            (BackupExists(p.clone()), "BACKUP_EXISTS: /tmp/b/x.sqlite"),
            (BackupPathNotUtf8, "BACKUP_PATH_NOT_UTF8"),
            (BackupFailed("disk full".into()), "BACKUP_FAILED: disk full"),
            (
                BackupUnreadable("locked".into()),
                "BACKUP_UNREADABLE: locked",
            ),
            (BackupCorrupt("page 3".into()), "BACKUP_CORRUPT: page 3"),
            (BackupMismatch, "BACKUP_MISMATCH: row counts differ"),
            (BackupTooLarge, "BACKUP_TOO_LARGE"),
            (NoFolder(p.clone()), "no folder for /tmp/b/x.sqlite"),
            (NoFileName(p), "no file name in /tmp/b/x.sqlite"),
            (SavedFileMismatch, "the saved file does not match"),
            (
                MissingHeader("x-save-options"),
                "missing x-save-options header",
            ),
            (InvalidPercentEscape, "invalid percent escape"),
            (ExpectedRawBody, "expected the file contents as raw bytes"),
            (InvalidMenuLabel("pages"), "invalid menu label: pages"),
        ];
        for (e, want) in cases {
            assert_eq!(e.to_string(), want);
        }
    }

    #[test]
    fn serialises_as_its_display_string() {
        let json = serde_json::to_string(&ForeignKeyCheck(1)).unwrap();
        assert_eq!(json, r#""FOREIGN_KEY_CHECK_FAILED: 1 row(s)""#);
    }

    #[test]
    fn library_errors_pass_through_verbatim() {
        let io = std::io::Error::new(std::io::ErrorKind::NotFound, "gone");
        assert_eq!(AppError::from(io).to_string(), "gone");
        assert_eq!(AppError::other("x: y").to_string(), "x: y");
    }
}
