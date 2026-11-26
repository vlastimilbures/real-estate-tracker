//! ADR 0270 point 4: `db_execute` runs one statement on the plugin's pool, like the
//! plugin's own `execute`, and fails with an `AppError`, so a single-statement write
//! carries an error code too. Temporary file databases opened as tauri-plugin-sql opens
//! them; never the real database.

use app_lib::db::execute_one;
use serde_json::json;
use sqlx::{Executor, Pool, Row, Sqlite};

mod common;
use common::{count, plugin_pool, st, TempDir};

async fn open(name: &str) -> (TempDir, Pool<Sqlite>) {
    let dir = TempDir::new(&format!("dbexecute-{name}"));
    let pool = plugin_pool(&dir).await;
    pool.execute("CREATE TABLE p (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, n INTEGER)")
        .await
        .unwrap();
    (dir, pool)
}

async fn cleanup(dir: TempDir, pool: Pool<Sqlite>) {
    pool.close().await;
    drop(dir);
}

#[tokio::test]
async fn returns_the_rows_affected() {
    let (dir, pool) = open("rows").await;
    let insert = |id: &str, name: &str| {
        st(
            "INSERT INTO p (id, name, n) VALUES (?, ?, ?)",
            vec![json!(id), json!(name), json!(1)],
        )
    };
    assert_eq!(
        execute_one(&pool, &insert("a", "A"))
            .await
            .unwrap()
            .rows_affected,
        1
    );
    assert_eq!(
        execute_one(&pool, &insert("b", "B"))
            .await
            .unwrap()
            .rows_affected,
        1
    );
    let all = st("UPDATE p SET n = ?", vec![json!(2)]);
    assert_eq!(execute_one(&pool, &all).await.unwrap().rows_affected, 2);
    let none = st(
        "UPDATE p SET n = ? WHERE id = ?",
        vec![json!(3), json!("x")],
    );
    assert_eq!(execute_one(&pool, &none).await.unwrap().rows_affected, 0);
    cleanup(dir, pool).await;
}

#[tokio::test]
async fn sends_rows_affected_in_camel_case() {
    let (dir, pool) = open("wire").await;
    let done = execute_one(&pool, &st("DELETE FROM p", vec![]))
        .await
        .unwrap();
    assert_eq!(
        serde_json::to_value(done).unwrap(),
        json!({ "rowsAffected": 0 })
    );
    cleanup(dir, pool).await;
}

#[tokio::test]
async fn binds_its_values_as_a_transaction_does() {
    let (dir, pool) = open("bind").await;
    execute_one(
        &pool,
        &st(
            "INSERT INTO p (id, name, n) VALUES (?, ?, ?)",
            vec![json!("a"), json!("9515405.13"), json!(7)],
        ),
    )
    .await
    .unwrap();
    let row = sqlx::query("SELECT name, typeof(n), n FROM p")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(row.get::<String, _>(0), "9515405.13");
    assert_eq!(row.get::<String, _>(1), "integer");
    assert_eq!(row.get::<i64, _>(2), 7);
    cleanup(dir, pool).await;
}

#[tokio::test]
async fn a_refused_write_is_an_app_error_and_writes_nothing() {
    let (dir, pool) = open("refused").await;
    let insert = |id: &str| {
        st(
            "INSERT INTO p (id, name) VALUES (?, ?)",
            vec![json!(id), json!("A")],
        )
    };
    execute_one(&pool, &insert("a")).await.unwrap();
    let err = execute_one(&pool, &insert("b")).await.unwrap_err();
    assert_eq!(err.code(), "SQL");
    assert!(
        err.to_string().contains("UNIQUE constraint failed: p.name"),
        "{err}"
    );
    assert_eq!(count(&pool, "p").await, 1);
    cleanup(dir, pool).await;
}

#[tokio::test]
async fn an_unsupported_value_is_refused_before_it_runs() {
    let (dir, pool) = open("param").await;
    let err = execute_one(
        &pool,
        &st(
            "INSERT INTO p (id, name) VALUES (?, ?)",
            vec![json!("a"), json!([1])],
        ),
    )
    .await
    .unwrap_err();
    assert_eq!(err.code(), "UNSUPPORTED_PARAM");
    assert_eq!(count(&pool, "p").await, 0);
    cleanup(dir, pool).await;
}
