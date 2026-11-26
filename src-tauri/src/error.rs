//! The one error type of the Tauri commands (DR-173).
//!
//! Each failure is a typed variant. It crosses the IPC boundary as `{ code, detail }`
//! (ADR 0270): `code` is the stable code of `AppError::code`, which the webview matches
//! on (`src/platform/commandError.ts` keeps the same list, and a test there reads this
//! file); `detail` is the `Display` text, which the webview shows or logs as it is.
//! Renaming or removing a code needs an ADR. Editing a `Display` arm no longer breaks
//! error handling, but where the detail is shown, it is still a user-visible change.

use serde::ser::SerializeStruct;
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

    /// The stable code the webview matches on (ADR 0270): one per variant, upper snake
    /// case. `src/platform/commands.ts` keeps the same list, and its test reads this
    /// function. Renaming or removing a code needs an ADR.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Sql(_) => "SQL",
            Self::Io(_) => "IO",
            Self::Other(_) => "OTHER",
            Self::UnsupportedParam(_) => "UNSUPPORTED_PARAM",
            Self::UnsupportedDatatype(_) => "UNSUPPORTED_DATATYPE",
            Self::DbNotLoaded(_) => "DB_NOT_LOADED",
            Self::InvalidLabel(_) => "INVALID_LABEL",
            Self::InvalidBackupName(_) => "INVALID_BACKUP_NAME",
            Self::BackupExists(_) => "BACKUP_EXISTS",
            Self::BackupPathNotUtf8 => "BACKUP_PATH_NOT_UTF8",
            Self::BackupFailed(_) => "BACKUP_FAILED",
            Self::BackupUnreadable(_) => "BACKUP_UNREADABLE",
            Self::BackupCorrupt(_) => "BACKUP_CORRUPT",
            Self::BackupMismatch => "BACKUP_MISMATCH",
            Self::BackupTooLarge => "BACKUP_TOO_LARGE",
            Self::NoFolder(_) => "NO_FOLDER",
            Self::NoFileName(_) => "NO_FILE_NAME",
            Self::SavedFileMismatch => "SAVED_FILE_MISMATCH",
            Self::MissingHeader(_) => "MISSING_HEADER",
            Self::InvalidPercentEscape => "INVALID_PERCENT_ESCAPE",
            Self::ExpectedRawBody => "EXPECTED_RAW_BODY",
            Self::InvalidMenuLabel(_) => "INVALID_MENU_LABEL",
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sql(m) | Self::Io(m) | Self::Other(m) => f.write_str(m),
            Self::UnsupportedParam(v) => write!(f, "unsupported parameter type: {v}"),
            Self::UnsupportedDatatype(t) => write!(f, "unsupported datatype: {t}"),
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

/// On the wire an `AppError` is `{ code, detail }`: its code and its `Display` text
/// (ADR 0270).
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut out = s.serialize_struct("AppError", 2)?;
        out.serialize_field("code", self.code())?;
        out.serialize_field("detail", &self.to_string())?;
        out.end()
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
    use serde_json::json;
    use std::collections::HashSet;
    use std::path::PathBuf;

    /// One sample of every variant with its display text and its code (ADR 0270).
    fn samples() -> Vec<(AppError, &'static str, &'static str)> {
        let p = PathBuf::from("/tmp/b/x.sqlite");
        vec![
            (
                Sql("UNIQUE constraint failed: t.a".into()),
                "UNIQUE constraint failed: t.a",
                "SQL",
            ),
            (
                Io("No such file or directory (os error 2)".into()),
                "No such file or directory (os error 2)",
                "IO",
            ),
            (Other("boom".into()), "boom", "OTHER"),
            (
                UnsupportedParam("[1]".into()),
                "unsupported parameter type: [1]",
                "UNSUPPORTED_PARAM",
            ),
            (
                UnsupportedDatatype("DATE".into()),
                "unsupported datatype: DATE",
                "UNSUPPORTED_DATATYPE",
            ),
            (
                DbNotLoaded("sqlite:x.db".into()),
                "database not loaded: sqlite:x.db",
                "DB_NOT_LOADED",
            ),
            (
                InvalidLabel("a b".into()),
                "invalid backup label: a b",
                "INVALID_LABEL",
            ),
            (
                InvalidBackupName("x.txt".into()),
                "invalid backup file name: x.txt",
                "INVALID_BACKUP_NAME",
            ),
            (
                BackupExists(p.clone()),
                "BACKUP_EXISTS: /tmp/b/x.sqlite",
                "BACKUP_EXISTS",
            ),
            (
                BackupPathNotUtf8,
                "BACKUP_PATH_NOT_UTF8",
                "BACKUP_PATH_NOT_UTF8",
            ),
            (
                BackupFailed("disk full".into()),
                "BACKUP_FAILED: disk full",
                "BACKUP_FAILED",
            ),
            (
                BackupUnreadable("locked".into()),
                "BACKUP_UNREADABLE: locked",
                "BACKUP_UNREADABLE",
            ),
            (
                BackupCorrupt("page 3".into()),
                "BACKUP_CORRUPT: page 3",
                "BACKUP_CORRUPT",
            ),
            (
                BackupMismatch,
                "BACKUP_MISMATCH: row counts differ",
                "BACKUP_MISMATCH",
            ),
            (BackupTooLarge, "BACKUP_TOO_LARGE", "BACKUP_TOO_LARGE"),
            (
                NoFolder(p.clone()),
                "no folder for /tmp/b/x.sqlite",
                "NO_FOLDER",
            ),
            (
                NoFileName(p),
                "no file name in /tmp/b/x.sqlite",
                "NO_FILE_NAME",
            ),
            (
                SavedFileMismatch,
                "the saved file does not match",
                "SAVED_FILE_MISMATCH",
            ),
            (
                MissingHeader("x-save-options"),
                "missing x-save-options header",
                "MISSING_HEADER",
            ),
            (
                InvalidPercentEscape,
                "invalid percent escape",
                "INVALID_PERCENT_ESCAPE",
            ),
            (
                ExpectedRawBody,
                "expected the file contents as raw bytes",
                "EXPECTED_RAW_BODY",
            ),
            (
                InvalidMenuLabel("pages"),
                "invalid menu label: pages",
                "INVALID_MENU_LABEL",
            ),
        ]
    }

    /// Every variant keeps the exact string the commands returned before DR-173.
    #[test]
    fn display_matches_the_pre_dr173_strings() {
        for (e, want, _) in samples() {
            assert_eq!(e.to_string(), want);
        }
    }

    /// Each of the 22 variants has its own code, in upper snake case (ADR 0270 point 1).
    #[test]
    fn every_variant_has_its_own_code() {
        let all = samples();
        assert_eq!(all.len(), 22, "one sample per variant");
        let mut seen = HashSet::new();
        for (e, _, want) in &all {
            let code = e.code();
            assert_eq!(code, *want);
            assert!(
                code.chars()
                    .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_'),
                "{code} is not upper snake case"
            );
            assert!(seen.insert(code), "{code} is used twice");
        }
    }

    /// On the wire an error is `{ code, detail }`, `detail` its `Display` text (ADR 0270).
    #[test]
    fn serialises_as_code_and_detail() {
        let json = serde_json::to_value(BackupFailed("disk full".into())).unwrap();
        assert_eq!(
            json,
            json!({ "code": "BACKUP_FAILED", "detail": "BACKUP_FAILED: disk full" })
        );
        for (e, detail, code) in samples() {
            let json = serde_json::to_value(&e).unwrap();
            assert_eq!(json, json!({ "code": code, "detail": detail }));
        }
    }

    #[test]
    fn library_errors_pass_through_verbatim() {
        let io = std::io::Error::new(std::io::ErrorKind::NotFound, "gone");
        assert_eq!(AppError::from(io).to_string(), "gone");
        assert_eq!(AppError::other("x: y").to_string(), "x: y");
    }
}
