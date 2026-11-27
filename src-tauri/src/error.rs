//! The one error type of the Tauri commands.
//!
//! Each failure is a typed variant. It crosses the IPC boundary as `{ code, detail }`
//! (ADR 0270): `code` is the stable code of `AppError::code`, which the webview matches
//! on (`src/platform/commandError.ts` keeps the same list, and a test there reads this
//! file); `detail` is the `Display` text, which the webview shows or logs as it is.
//! Renaming or removing a code needs an ADR. Editing a `Display` arm no longer breaks
//! error handling, but where the detail is shown, it is still a user-visible change.
//! A write SQLite refuses for a constraint also sends `constraint`, the fields of
//! TypeScript's `ConstraintFailure`, read here from SQLite's extended result code and its
//! own message, so the webview never parses a driver's text.

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use std::fmt;
use std::path::PathBuf;

/// The constraint a refused write broke (ADR 0270 point 3): the table and columns of a
/// UNIQUE (or PRIMARY KEY) or NOT NULL failure, the CHECK constraint's name, or a
/// FOREIGN KEY failure. Names only, never a value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Constraint {
    Unique { table: String, columns: Vec<String> },
    NotNull { table: String, columns: Vec<String> },
    Check { check: String },
    ForeignKey,
}

/// SQLite's extended result codes for the constraints the app names.
const SQLITE_CONSTRAINT_CHECK: i64 = 275;
const SQLITE_CONSTRAINT_FOREIGNKEY: i64 = 787;
const SQLITE_CONSTRAINT_NOTNULL: i64 = 1299;
const SQLITE_CONSTRAINT_PRIMARYKEY: i64 = 1555;
const SQLITE_CONSTRAINT_UNIQUE: i64 = 2067;

/// `t.a, t.b` → `("t", ["a", "b"])`: one table, every item `table.column` of plain names.
fn table_columns(list: &str) -> Option<(String, Vec<String>)> {
    let plain = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    let mut table = None;
    let mut columns = Vec::new();
    for item in list.split(", ") {
        let (t, c) = item.split_once('.')?;
        if !plain(t) || !plain(c) {
            return None;
        }
        table.get_or_insert_with(|| t.to_string());
        columns.push(c.to_string());
    }
    Some((table?, columns))
}

impl Constraint {
    /// The constraint behind SQLite's extended result `code`, named from its `message`
    /// (`UNIQUE constraint failed: t.a, t.b`, `CHECK constraint failed: name`). None for
    /// any other code, or a message that does not name it as expected.
    pub fn from_sqlite(code: i64, message: &str) -> Option<Self> {
        let after = |prefix: &str| message.strip_prefix(prefix);
        match code {
            SQLITE_CONSTRAINT_UNIQUE | SQLITE_CONSTRAINT_PRIMARYKEY => {
                let (table, columns) = table_columns(after("UNIQUE constraint failed: ")?)?;
                Some(Self::Unique { table, columns })
            }
            SQLITE_CONSTRAINT_NOTNULL => {
                let (table, columns) = table_columns(after("NOT NULL constraint failed: ")?)?;
                Some(Self::NotNull { table, columns })
            }
            SQLITE_CONSTRAINT_CHECK => {
                // A named CHECK; an unnamed one shows its expression, of which the first
                // word is kept, as before.
                let name: String = after("CHECK constraint failed: ")?
                    .chars()
                    .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                    .collect();
                (!name.is_empty()).then_some(Self::Check { check: name })
            }
            SQLITE_CONSTRAINT_FOREIGNKEY => Some(Self::ForeignKey),
            _ => None,
        }
    }
}

#[derive(Debug)]
pub enum AppError {
    /// An sqlx / SQLite error, verbatim, with the constraint it names, if any.
    Sql(String, Option<Constraint>),
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
    /// case. `src/platform/commandError.ts` keeps the same list, and a test reads this
    /// function. Renaming or removing a code needs an ADR.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Sql(..) => "SQL",
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
            Self::Sql(m, _) | Self::Io(m) | Self::Other(m) => f.write_str(m),
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

/// On the wire an `AppError` is `{ code, detail }`: its code and its `Display` text, and
/// for a constraint failure also `constraint` (ADR 0270).
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let constraint = match self {
            Self::Sql(_, c) => c.as_ref(),
            _ => None,
        };
        let mut out = s.serialize_struct("AppError", 2 + usize::from(constraint.is_some()))?;
        out.serialize_field("code", self.code())?;
        out.serialize_field("detail", &self.to_string())?;
        if let Some(c) = constraint {
            out.serialize_field("constraint", c)?;
        }
        out.end()
    }
}

/// sqlx's text as the detail; for a database error, the constraint its extended result
/// code and SQLite's own message (without sqlx's wrapper) name.
impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        let constraint = match &e {
            sqlx::Error::Database(db) => db
                .code()
                .and_then(|c| c.parse::<i64>().ok())
                .and_then(|code| Constraint::from_sqlite(code, db.message())),
            _ => None,
        };
        Self::Sql(e.to_string(), constraint)
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
    use super::Constraint;
    use serde_json::json;
    use std::collections::HashSet;
    use std::path::PathBuf;

    /// One sample of every variant with its display text and its code (ADR 0270).
    fn samples() -> Vec<(AppError, &'static str, &'static str)> {
        let p = PathBuf::from("/tmp/b/x.sqlite");
        vec![
            (
                Sql("UNIQUE constraint failed: t.a".into(), None),
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

    /// Every variant keeps the exact string the commands returned before they shared this type.
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

    fn unique(table: &str, columns: &[&str]) -> Constraint {
        Constraint::Unique {
            table: table.into(),
            columns: columns.iter().map(|c| c.to_string()).collect(),
        }
    }

    /// ADR 0270 point 3: SQLite's extended result code says which constraint failed, and
    /// SQLite's own message names the table and columns, or the CHECK's name.
    #[test]
    fn a_constraint_comes_from_the_extended_code_and_the_message() {
        let cases = [
            (
                2067,
                "UNIQUE constraint failed: t.a",
                Some(unique("t", &["a"])),
            ),
            (
                2067,
                "UNIQUE constraint failed: t.a, t.b",
                Some(unique("t", &["a", "b"])),
            ),
            (
                1555,
                "UNIQUE constraint failed: t.id",
                Some(unique("t", &["id"])),
            ),
            (
                1299,
                "NOT NULL constraint failed: t.a",
                Some(Constraint::NotNull {
                    table: "t".into(),
                    columns: vec!["a".into()],
                }),
            ),
            (
                275,
                "CHECK constraint failed: rule_x",
                Some(Constraint::Check {
                    check: "rule_x".into(),
                }),
            ),
            (
                787,
                "FOREIGN KEY constraint failed",
                Some(Constraint::ForeignKey),
            ),
        ];
        for (code, message, want) in cases {
            assert_eq!(Constraint::from_sqlite(code, message), want, "{message}");
        }
    }

    /// Text that only looks like a constraint message is none: the code decides, and a
    /// message the parser does not recognise gives no fields rather than wrong ones.
    #[test]
    fn a_look_alike_is_no_constraint() {
        for (code, message) in [
            (1, "UNIQUE constraint failed: t.a"),
            (19, "UNIQUE constraint failed: t.a"),
            (2067, "UNIQUE constraint failed: index 'x'"),
            (2067, "UNIQUE constraint failed: "),
            (1299, "NOT NULL constraint failed: a"),
            (275, "CHECK constraint failed: "),
            (275, "something else"),
            (5, "database is locked"),
        ] {
            assert_eq!(
                Constraint::from_sqlite(code, message),
                None,
                "{code} {message}"
            );
        }
    }

    /// On the wire a constraint has the shape of TypeScript's `ConstraintFailure`, next to
    /// the code and the unchanged detail.
    #[test]
    fn a_constraint_failure_sends_its_fields() {
        let detail = "error returned from database: (code: 2067) UNIQUE constraint failed: t.a";
        let e = Sql(detail.into(), Some(unique("t", &["a"])));
        assert_eq!(e.to_string(), detail);
        assert_eq!(
            serde_json::to_value(&e).unwrap(),
            json!({
                "code": "SQL",
                "detail": detail,
                "constraint": { "kind": "unique", "table": "t", "columns": ["a"] },
            })
        );
        let shapes = [
            (
                Constraint::NotNull {
                    table: "t".into(),
                    columns: vec!["a".into()],
                },
                json!({ "kind": "notNull", "table": "t", "columns": ["a"] }),
            ),
            (
                Constraint::Check { check: "c".into() },
                json!({ "kind": "check", "check": "c" }),
            ),
            (Constraint::ForeignKey, json!({ "kind": "foreignKey" })),
        ];
        for (c, want) in shapes {
            assert_eq!(serde_json::to_value(&c).unwrap(), want);
        }
    }

    #[test]
    fn library_errors_pass_through_verbatim() {
        let io = std::io::Error::new(std::io::ErrorKind::NotFound, "gone");
        assert_eq!(AppError::from(io).to_string(), "gone");
        assert_eq!(AppError::other("x: y").to_string(), "x: y");
    }
}
