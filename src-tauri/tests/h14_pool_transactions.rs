//! H-14 proof (P5a step 0): is `BEGIN … COMMIT/ROLLBACK` issued through
//! `@tauri-apps/plugin-sql` atomic, and does `PRAGMA foreign_keys` hold on every call?
//!
//! The plugin (tauri-plugin-sql 2.4.0, `src/wrapper.rs`) opens the DB with
//! `sqlx::Pool::<Sqlite>::connect(url)` — sqlx defaults, max 10 connections — and runs
//! every JS `execute`/`select` as `pool.execute(query)`, i.e. on whichever pooled
//! connection is free. These tests drive sqlx the same way against a temporary file DB.
//! They never touch the real database.

use sqlx::{Executor, Pool, Row, Sqlite};
use std::path::PathBuf;

fn temp_db(name: &str) -> (PathBuf, String) {
    let path = std::env::temp_dir().join(format!("ret-h14-{}-{}.sqlite", name, std::process::id()));
    let _ = std::fs::remove_file(&path);
    let url = format!("sqlite:{}?mode=rwc", path.display());
    (path, url)
}

async fn open(url: &str) -> Pool<Sqlite> {
    // Exactly the plugin's call.
    let pool = Pool::<Sqlite>::connect(url).await.unwrap();
    pool.execute("CREATE TABLE IF NOT EXISTS p (id TEXT PRIMARY KEY)")
        .await
        .unwrap();
    pool.execute(
        "CREATE TABLE IF NOT EXISTS c (id TEXT PRIMARY KEY, \
         p_id TEXT NOT NULL REFERENCES p(id) ON DELETE CASCADE)",
    )
    .await
    .unwrap();
    pool
}

async fn count(url: &str, table: &str) -> i64 {
    // A separate pool = an independent reader that only sees committed data.
    let pool = Pool::<Sqlite>::connect(url).await.unwrap();
    let n = sqlx::query(&format!("SELECT COUNT(*) AS n FROM {table}"))
        .fetch_one(&pool)
        .await
        .unwrap()
        .get::<i64, _>("n");
    pool.close().await;
    n
}

/// sqlx enables `foreign_keys` on every connection it opens, so FK enforcement does
/// not depend on which pooled connection a statement lands on.
#[tokio::test]
async fn foreign_keys_on_for_every_pooled_connection() {
    let (path, url) = temp_db("fk");
    let pool = open(&url).await;
    // Hold three connections at once: forces the pool to open distinct connections.
    let mut held = Vec::new();
    for _ in 0..3 {
        held.push(pool.acquire().await.unwrap());
    }
    for conn in held.iter_mut() {
        let fk: i64 = sqlx::query("PRAGMA foreign_keys")
            .fetch_one(&mut **conn)
            .await
            .unwrap()
            .get(0);
        assert_eq!(fk, 1);
        let orphan = sqlx::query("INSERT INTO c (id, p_id) VALUES ('x', 'missing')")
            .execute(&mut **conn)
            .await;
        assert!(
            orphan.is_err(),
            "orphan insert must fail on every connection"
        );
    }
    drop(held);
    pool.close().await;
    let _ = std::fs::remove_file(path);
}

/// Even strictly sequential, awaited calls are not atomic: a connection goes back to the
/// idle queue asynchronously after each call, so the next call can be handed a different
/// connection. Observed 6/6 runs on macOS (sqlx 0.8.6): the INSERT commits outside the
/// transaction and ROLLBACK cannot undo it. Timing-dependent (DR-169), so not run in CI:
/// `cargo test -- --ignored` runs it.
#[tokio::test]
#[ignore = "DR-169: timing-dependent pool probe; run with `cargo test -- --ignored`"]
async fn sequential_begin_rollback_is_not_atomic_either() {
    let (path, url) = temp_db("seq");
    let pool = open(&url).await;
    pool.execute("BEGIN").await.unwrap();
    pool.execute("INSERT INTO p (id) VALUES ('a')")
        .await
        .unwrap();
    let _ = pool.execute("ROLLBACK").await;
    assert_eq!(count(&url, "p").await, 1, "the row leaked past ROLLBACK");
    pool.close().await;
    let _ = std::fs::remove_file(path);
}

/// H-14 CONFIRMED: when any other call is in flight (a UI reload, a second save), the
/// pool hands the next statement of the "transaction" to a different connection. That
/// statement autocommits outside the transaction, and ROLLBACK cannot undo it.
///
/// Deterministic (DR-169): the test holds connection A, which carries the open
/// transaction, so the pool must run the next write on another connection B.
#[tokio::test]
async fn begin_via_pool_is_not_atomic_under_concurrency() {
    let (path, url) = temp_db("conc");
    let pool = open(&url).await;
    let mut a = pool.acquire().await.unwrap();
    a.execute("BEGIN").await.unwrap();
    // While A is busy (as with a concurrent call), the transaction's next write lands on
    // connection B and autocommits.
    pool.execute("INSERT INTO p (id) VALUES ('leaked')")
        .await
        .unwrap();
    assert_eq!(
        count(&url, "p").await,
        1,
        "write issued inside BEGIN is already committed and visible to other readers"
    );
    a.execute("ROLLBACK").await.unwrap();
    assert_eq!(count(&url, "p").await, 1, "ROLLBACK did not undo it");
    drop(a);
    pool.close().await;
    let _ = std::fs::remove_file(path);
}

/// The batch alternative (J-13 option a): one `execute` carrying the whole
/// `BEGIN; …; COMMIT;` text runs on ONE connection. sqlx's SQLite driver executes every
/// statement of a multi-statement string. A failing statement stops the batch; the
/// caller must then make sure the connection is not left mid-transaction.
#[tokio::test]
async fn single_batch_runs_on_one_connection_and_is_atomic() {
    let (path, url) = temp_db("batch");
    let pool = open(&url).await;
    // As the plugin does: `sqlx::query(text)` + positional binds, one `pool.execute`.
    // Binds are consumed in order across the statements of the batch.
    pool.execute(
        sqlx::query("BEGIN; INSERT INTO p (id) VALUES (?); INSERT INTO p (id) VALUES (?); COMMIT;")
            .bind("a")
            .bind("b"),
    )
    .await
    .unwrap();
    assert_eq!(count(&url, "p").await, 2);
    // Duplicate key mid-batch: the batch errors after the first INSERT.
    let r = pool
        .execute(sqlx::query(
            "BEGIN; INSERT INTO p (id) VALUES ('c'); INSERT INTO p (id) VALUES ('a'); COMMIT;",
        ))
        .await;
    assert!(r.is_err());
    // 'c' is not visible to other readers: its transaction never committed.
    assert_eq!(count(&url, "p").await, 2);
    pool.close().await;
    let _ = std::fs::remove_file(path);
}
