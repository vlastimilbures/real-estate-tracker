//! Atomic writes and verified pre-migration backups (ADR 0014, option b).
//!
//! `@tauri-apps/plugin-sql` runs every JS call on whichever pooled connection is free, so
//! `BEGIN … COMMIT` sent from JS is not atomic (ADR 0014, proven in
//! tests/h14_pool_transactions.rs). These commands borrow the plugin's own pool
//! (`DbInstances`) and run a whole statement list on ONE connection inside a real sqlx
//! transaction: every statement commits, or none does. Reads that must agree with each
//! other (the portfolio load, ADR 0066) run the same way inside one read transaction.
//! A single statement runs here too (`db_execute`, ADR 0270), so every write fails with
//! an `AppError` and its code; only reads stay on the plugin's `select`.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value as JsonValue};
use sqlx::sqlite::{SqliteArguments, SqliteConnectOptions, SqliteRow, SqliteValueRef};
use sqlx::{
    Column, Connection, Executor, Pool, Row, Sqlite, SqliteConnection, TypeInfo, Value, ValueRef,
};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::error::AppError;
use crate::paths::{backups_dir, valid_label, DB_URL};

/// One parameterised statement, as the JS `Sql` seam sends it.
#[derive(Debug, Deserialize)]
pub struct Statement {
    pub query: String,
    #[serde(default)]
    pub params: Vec<JsonValue>,
}

type Query<'q> = sqlx::query::Query<'q, Sqlite, SqliteArguments<'q>>;

/// Bind a JSON value the way tauri-plugin-sql does (null, string, number), except that
/// integral numbers bind as INTEGER rather than REAL. Booleans bind as 0/1.
fn bind<'q>(query: Query<'q>, value: &'q JsonValue) -> Result<Query<'q>, AppError> {
    Ok(match value {
        JsonValue::Null => query.bind(None::<String>),
        JsonValue::String(s) => query.bind(s.as_str()),
        JsonValue::Bool(b) => query.bind(i64::from(*b)),
        JsonValue::Number(n) => match n.as_i64() {
            Some(i) => query.bind(i),
            None => query.bind(n.as_f64().unwrap_or_default()),
        },
        other => return Err(AppError::UnsupportedParam(other.to_string())),
    })
}

fn build(s: &Statement) -> Result<Query<'_>, AppError> {
    let mut q = sqlx::query(&s.query);
    for p in &s.params {
        q = bind(q, p)?;
    }
    Ok(q)
}

async fn run_in_transaction(
    conn: &mut SqliteConnection,
    statements: &[Statement],
) -> Result<(), AppError> {
    let mut tx = conn.begin().await?;
    let mut outcome: Result<(), AppError> = Ok(());
    for s in statements {
        let q = match build(s) {
            Ok(q) => q,
            Err(e) => {
                outcome = Err(e);
                break;
            }
        };
        if let Err(e) = tx.execute(q).await {
            outcome = Err(e.into());
            break;
        }
    }
    match outcome {
        Ok(()) => tx.commit().await.map_err(AppError::from),
        Err(e) => {
            // Explicit rollback; a failed rollback still surfaces the original error.
            let _ = tx.rollback().await;
            Err(e)
        }
    }
}

/// What one statement changed, as the plugin's `execute` reports it to the webview.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    pub rows_affected: u64,
}

/// Run one statement on the pool, bound as a transaction's statements are.
pub async fn execute_one(
    pool: &Pool<Sqlite>,
    statement: &Statement,
) -> Result<ExecuteResult, AppError> {
    let done = pool.execute(build(statement)?).await?;
    Ok(ExecuteResult {
        rows_affected: done.rows_affected(),
    })
}

/// Run `statements` on one pooled connection inside one transaction.
pub async fn run_atomic(pool: &Pool<Sqlite>, statements: &[Statement]) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    run_in_transaction(&mut conn, statements).await
}

/// One result row: column name → JSON value, decoded as tauri-plugin-sql's `select` does.
/// Unlike the plugin's (column order), the keys come out in name order (serde_json `Map`).
pub type JsonRow = Map<String, JsonValue>;

/// A column value as JSON, exactly as tauri-plugin-sql 2.4.0 decodes it
/// (`src/decode/sqlite.rs`, same `type_info` dispatch). A value's type is its storage
/// class (TEXT / REAL / INTEGER / BLOB / NULL); the plugin's DATE / TIME / DATETIME /
/// BOOLEAN arms are not copied and raise an error instead, so a decode can never
/// silently differ from the plugin's.
fn to_json(v: SqliteValueRef) -> Result<JsonValue, AppError> {
    if v.is_null() {
        return Ok(JsonValue::Null);
    }
    let owned = ValueRef::to_owned(&v);
    Ok(match v.type_info().name() {
        "TEXT" => owned
            .try_decode::<String>()
            .map_or(JsonValue::Null, JsonValue::String),
        "REAL" => owned
            .try_decode::<f64>()
            .map_or(JsonValue::Null, JsonValue::from),
        "INTEGER" | "NUMERIC" => owned
            .try_decode::<i64>()
            .map_or(JsonValue::Null, |n| JsonValue::Number(n.into())),
        "BLOB" => owned.try_decode::<Vec<u8>>().map_or(JsonValue::Null, |b| {
            JsonValue::Array(b.into_iter().map(|n| JsonValue::Number(n.into())).collect())
        }),
        "NULL" => JsonValue::Null,
        other => return Err(AppError::UnsupportedDatatype(other.to_string())),
    })
}

fn row_to_json(row: &SqliteRow) -> Result<JsonRow, AppError> {
    let mut out = Map::new();
    for (i, column) in row.columns().iter().enumerate() {
        let v = row.try_get_raw(i)?;
        out.insert(column.name().to_string(), to_json(v)?);
    }
    Ok(out)
}

/// Run the SELECTs `statements` on one pooled connection inside one read transaction,
/// so every result comes from the same database state (a point-in-time snapshot,
/// ADR 0066). Returns one row list per statement, in order.
pub async fn select_snapshot(
    pool: &Pool<Sqlite>,
    statements: &[Statement],
) -> Result<Vec<Vec<JsonRow>>, AppError> {
    let mut conn = pool.acquire().await?;
    let mut tx = conn.begin().await?;
    let mut results = Vec::with_capacity(statements.len());
    for s in statements {
        let rows = tx.fetch_all(build(s)?).await?;
        results.push(rows.iter().map(row_to_json).collect::<Result<_, _>>()?);
    }
    // Read-only: nothing to keep, so end the transaction without committing.
    tx.rollback().await?;
    Ok(results)
}

async fn table_counts(conn: &mut SqliteConnection) -> Result<Vec<(String, i64)>, AppError> {
    let tables: Vec<String> = sqlx::query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .fetch_all(&mut *conn)
    .await?
    .iter()
    .map(|r| r.get::<String, _>(0))
    .collect();
    let mut counts = Vec::with_capacity(tables.len());
    for t in tables {
        // Table names come from sqlite_master, quoted as identifiers.
        let n: i64 = sqlx::query(&format!(
            "SELECT COUNT(*) FROM \"{}\"",
            t.replace('"', "\"\"")
        ))
        .fetch_one(&mut *conn)
        .await?
        .get(0);
        counts.push((t, n));
    }
    Ok(counts)
}

/// Copy the database to `dest` with `VACUUM INTO` (a consistent snapshot), then verify
/// the copy: it opens read-only, `PRAGMA integrity_check` is `ok`, and every table has
/// the same row count as the source. Refuses to overwrite an existing file.
pub async fn backup_to(pool: &Pool<Sqlite>, dest: &Path) -> Result<(), AppError> {
    if dest.exists() {
        return Err(AppError::BackupExists(dest.to_path_buf()));
    }
    let dest_str = dest.to_str().ok_or(AppError::BackupPathNotUtf8)?;
    sqlx::query("VACUUM INTO ?")
        .bind(dest_str)
        .execute(pool)
        .await
        .map_err(|e| AppError::BackupFailed(e.to_string()))?;

    let mut copy =
        SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(dest).read_only(true))
            .await
            .map_err(|e| AppError::BackupUnreadable(e.to_string()))?;
    let check: String = sqlx::query("PRAGMA integrity_check")
        .fetch_one(&mut copy)
        .await
        .map_err(|e| AppError::BackupUnreadable(e.to_string()))?
        .get(0);
    if check != "ok" {
        return Err(AppError::BackupCorrupt(check));
    }
    let copied = table_counts(&mut copy).await?;
    let _ = copy.close().await;
    let mut source = pool.acquire().await?;
    let original = table_counts(&mut source).await?;
    if copied != original {
        return Err(AppError::BackupMismatch);
    }
    Ok(())
}

async fn pool_for(instances: &DbInstances, db: &str) -> Result<Pool<Sqlite>, AppError> {
    let guard = instances.0.read().await;
    match guard.get(db) {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err(AppError::DbNotLoaded(db.to_string())),
    }
}

/// Run one statement (see `execute_one`); the webview's single-statement writes.
#[tauri::command]
pub async fn db_execute(
    instances: State<'_, DbInstances>,
    query: String,
    params: Vec<JsonValue>,
) -> Result<ExecuteResult, AppError> {
    let pool = pool_for(&instances, DB_URL).await?;
    execute_one(&pool, &Statement { query, params }).await
}

#[tauri::command]
pub async fn db_transaction(
    instances: State<'_, DbInstances>,
    statements: Vec<Statement>,
) -> Result<(), AppError> {
    let pool = pool_for(&instances, DB_URL).await?;
    run_atomic(&pool, &statements).await
}

/// Run read-only `statements` as one point-in-time snapshot (see `select_snapshot`).
#[tauri::command]
pub async fn db_select_snapshot(
    instances: State<'_, DbInstances>,
    statements: Vec<Statement>,
) -> Result<Vec<Vec<JsonRow>>, AppError> {
    let pool = pool_for(&instances, DB_URL).await?;
    select_snapshot(&pool, &statements).await
}

/// Write a verified backup to `<app-config>/backups/<label>.sqlite` (the directory that
/// holds the database itself) and return its full path.
#[tauri::command]
pub async fn db_backup(
    app: AppHandle,
    instances: State<'_, DbInstances>,
    label: String,
) -> Result<String, AppError> {
    if !valid_label(&label) {
        return Err(AppError::InvalidLabel(label));
    }
    let dir: PathBuf = backups_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| AppError::BackupFailed(e.to_string()))?;
    let dest = dir.join(format!("{label}.sqlite"));
    let pool = pool_for(&instances, DB_URL).await?;
    backup_to(&pool, &dest).await?;
    // `VACUUM INTO` creates the copy with the default mode; keep it private (ADR 0080).
    crate::private_fs::restrict_file(&dest)?;
    Ok(dest.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::valid_label;

    #[test]
    fn labels_are_file_name_safe() {
        assert!(valid_label("pre-migration-v6-to-v7-20261001T120000Z"));
        assert!(!valid_label("../escape"));
        assert!(!valid_label("a b"));
        assert!(!valid_label(""));
    }

    /// #473: the exact edges of the label rule, kept when the rule is shared.
    #[test]
    fn label_edges() {
        assert!(valid_label(&"a".repeat(100)));
        assert!(!valid_label(&"a".repeat(101)));
        for ok in ["-", "--", "0", "Z-9"] {
            assert!(valid_label(ok), "{ok:?}");
        }
        for bad in ["a.b", ".a", "a.sqlite", "a/b", "a\\b", "a\n"] {
            assert!(!valid_label(bad), "{bad:?}");
        }
    }

    /// #471: the label rule of the Sql contract (src/data/__tests__/fixtures/
    /// sql-contract.json), which the better-sqlite3 test adapter is checked against too.
    #[test]
    fn labels_match_the_contract() {
        let contract: serde_json::Value = serde_json::from_str(include_str!(
            "../../src/data/__tests__/fixtures/sql-contract.json"
        ))
        .unwrap();
        for (key, want) in [("valid", true), ("invalid", false)] {
            for label in contract["labels"][key].as_array().unwrap() {
                let label = label.as_str().unwrap();
                assert_eq!(valid_label(label), want, "{label:?}");
            }
        }
    }
}
