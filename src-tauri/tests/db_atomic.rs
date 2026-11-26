//! P5a: behaviour of src/db.rs (D-14) against temporary file databases opened exactly as
//! tauri-plugin-sql opens them. Never touches the real database.

use app_lib::db::{backup_to, run_atomic};
use serde_json::{json, Value};
use sqlx::{Executor, Pool, Row, Sqlite};

mod common;
use common::{count, plugin_pool, st, TempDir};

async fn open(name: &str) -> (TempDir, Pool<Sqlite>) {
    let dir = TempDir::new(&format!("dbatomic-{name}"));
    let pool = plugin_pool(&dir).await;
    pool.execute("CREATE TABLE p (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)")
        .await
        .unwrap();
    pool.execute(
        "CREATE TABLE c (id TEXT PRIMARY KEY, \
         p_id TEXT NOT NULL REFERENCES p(id) ON DELETE CASCADE)",
    )
    .await
    .unwrap();
    (dir, pool)
}

async fn cleanup(dir: TempDir, pool: Pool<Sqlite>) {
    pool.close().await;
    drop(dir);
}

#[tokio::test]
async fn commits_every_statement() {
    let (path, pool) = open("commit").await;
    run_atomic(
        &pool,
        &[
            st(
                "INSERT INTO p (id, name) VALUES (?, ?)",
                vec![json!("a"), json!("A")],
            ),
            st(
                "INSERT INTO c (id, p_id) VALUES (?, ?)",
                vec![json!("c1"), json!("a")],
            ),
        ],
    )
    .await
    .unwrap();
    assert_eq!(count(&pool, "p").await, 1);
    assert_eq!(count(&pool, "c").await, 1);
    cleanup(path, pool).await;
}

#[tokio::test]
async fn a_failing_statement_rolls_back_all_of_them() {
    let (path, pool) = open("rollback").await;
    let err = run_atomic(
        &pool,
        &[
            st("INSERT INTO p (id, name) VALUES ('a', 'A')", vec![]),
            st("INSERT INTO p (id, name) VALUES ('b', 'A')", vec![]), // UNIQUE(name)
        ],
    )
    .await
    .unwrap_err()
    .to_string();
    assert!(err.contains("UNIQUE"), "{err}");
    assert_eq!(count(&pool, "p").await, 0);
    // The pool is still usable and not stuck in a transaction.
    run_atomic(
        &pool,
        &[st("INSERT INTO p (id, name) VALUES ('z', 'Z')", vec![])],
    )
    .await
    .unwrap();
    assert_eq!(count(&pool, "p").await, 1);
    cleanup(path, pool).await;
}

#[tokio::test]
async fn foreign_keys_are_enforced_inside_a_transaction() {
    let (path, pool) = open("fk").await;
    let err = run_atomic(
        &pool,
        &[st(
            "INSERT INTO c (id, p_id) VALUES ('c1', 'missing')",
            vec![],
        )],
    )
    .await
    .unwrap_err()
    .to_string();
    assert!(err.contains("FOREIGN KEY"), "{err}");
    cleanup(path, pool).await;
}

#[tokio::test]
async fn binds_null_text_integer_and_real() {
    let (path, pool) = open("bind").await;
    pool.execute("CREATE TABLE v (t TEXT, i INTEGER, r REAL, n TEXT)")
        .await
        .unwrap();
    run_atomic(
        &pool,
        &[st(
            "INSERT INTO v (t, i, r, n) VALUES (?, ?, ?, ?)",
            vec![json!("9515405.13"), json!(7), json!(0.5), Value::Null],
        )],
    )
    .await
    .unwrap();
    let row = sqlx::query("SELECT t, typeof(i), r, n FROM v")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(row.get::<String, _>(0), "9515405.13");
    assert_eq!(row.get::<String, _>(1), "integer");
    assert_eq!(row.get::<f64, _>(2), 0.5);
    assert_eq!(row.get::<Option<String>, _>(3), None);
    cleanup(path, pool).await;
}

#[tokio::test]
async fn backup_writes_a_verified_copy_and_never_overwrites() {
    let (path, pool) = open("backup-src").await;
    pool.execute(
        "INSERT INTO p (id, name) VALUES ('a', 'A'); INSERT INTO c (id, p_id) VALUES ('c1', 'a');",
    )
    .await
    .unwrap();
    let dest = path.join("backup-dest.sqlite");
    backup_to(&pool, &dest).await.unwrap();
    let copy = Pool::<Sqlite>::connect(&format!("sqlite:{}?mode=ro", dest.display()))
        .await
        .unwrap();
    assert_eq!(count(&copy, "p").await, 1);
    assert_eq!(count(&copy, "c").await, 1);
    copy.close().await;
    let err = backup_to(&pool, &dest).await.unwrap_err().to_string();
    assert!(err.starts_with("BACKUP_EXISTS"), "{err}");
    cleanup(path, pool).await;
}

#[tokio::test]
async fn backup_into_a_missing_directory_fails() {
    let (path, pool) = open("backup-baddir").await;
    let dest = path.join("no-such-dir").join("x.sqlite");
    let err = backup_to(&pool, &dest).await.unwrap_err().to_string();
    assert!(err.starts_with("BACKUP_FAILED"), "{err}");
    cleanup(path, pool).await;
}

/// DR-084: a migration is sent as ONE multi-statement text; every statement in it runs
/// inside the transaction, and a failure in a later statement undoes the earlier ones.
#[tokio::test]
async fn multi_statement_text_runs_whole_inside_the_transaction() {
    let (path, pool) = open("batch-text").await;
    pool.execute(
        "INSERT INTO p (id, name) VALUES ('a', 'A'); INSERT INTO c (id, p_id) VALUES ('c1', 'a');",
    )
    .await
    .unwrap();
    let copy = "
        CREATE TABLE p_new (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE); -- comment
        INSERT INTO p_new (id, name) SELECT id, name FROM p;
        ALTER TABLE p_new RENAME TO p_copy;
    ";
    run_atomic(&pool, &[st(copy, vec![])]).await.unwrap();
    assert_eq!(count(&pool, "p_copy").await, 1);
    assert_eq!(count(&pool, "c").await, 1);

    let failing = "
        CREATE TABLE extra (id TEXT);
        INSERT INTO p (id, name) VALUES ('b', 'B');
        INSERT INTO no_such_table VALUES (1);
    ";
    assert!(run_atomic(&pool, &[st(failing, vec![])]).await.is_err());
    assert_eq!(count(&pool, "p").await, 1, "insert undone");
    let extra: i64 = sqlx::query("SELECT COUNT(*) FROM sqlite_master WHERE name = 'extra'")
        .fetch_one(&pool)
        .await
        .unwrap()
        .get(0);
    assert_eq!(extra, 0, "DDL undone");
    cleanup(path, pool).await;
}
