//! ADR 0196 (RUSTSEC-2026-0459 / CVE-2026-119375): the SQLite the app bundles through
//! libsqlite3-sys must be 3.54.0 or later, and a WAL database must still run a
//! transaction on it. Against a temporary file database; never the real database.

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use sqlx::{Connection, Row, SqliteConnection};

mod common;

fn version_parts(v: &str) -> (u32, u32, u32) {
    let mut it = v.split('.').map(|p| p.parse::<u32>().unwrap());
    (
        it.next().unwrap(),
        it.next().unwrap(),
        it.next().unwrap_or(0),
    )
}

#[tokio::test]
async fn bundled_sqlite_is_patched_and_runs_a_wal_transaction() {
    let dir = common::TempDir::new("sqlite-version");
    let path = dir.join("db.sqlite");
    let opts = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal);
    let mut conn = SqliteConnection::connect_with(&opts).await.unwrap();

    let version: String = sqlx::query("SELECT sqlite_version()")
        .fetch_one(&mut conn)
        .await
        .unwrap()
        .get(0);
    assert!(
        version_parts(&version) >= (3, 54, 0),
        "bundled SQLite {version} is older than 3.54.0 (RUSTSEC-2026-0459)"
    );

    sqlx::query("CREATE TABLE t (amount TEXT NOT NULL)")
        .execute(&mut conn)
        .await
        .unwrap();
    let mut tx = conn.begin().await.unwrap();
    sqlx::query("INSERT INTO t VALUES ('1234.56')")
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let amount: String = sqlx::query("SELECT amount FROM t")
        .fetch_one(&mut conn)
        .await
        .unwrap()
        .get(0);
    assert_eq!(amount, "1234.56");

    conn.close().await.unwrap();
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
    }
}
