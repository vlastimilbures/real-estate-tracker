//! P9 (DR-134): `select_snapshot` runs several SELECTs in one read transaction on one
//! pooled connection and returns rows the way tauri-plugin-sql's `select` does. Against
//! a temporary file database opened as the plugin opens it; never the real database.

use app_lib::db::{select_snapshot, Statement};
use serde_json::{json, Value};
use sqlx::{Executor, Pool, Sqlite};
use std::path::PathBuf;

async fn open(name: &str) -> (PathBuf, Pool<Sqlite>) {
    let path = std::env::temp_dir().join(format!(
        "ret-dbsnapshot-{}-{}.sqlite",
        name,
        std::process::id()
    ));
    let _ = std::fs::remove_file(&path);
    let pool = Pool::<Sqlite>::connect(&format!("sqlite:{}?mode=rwc", path.display()))
        .await
        .unwrap();
    pool.execute(
        "CREATE TABLE t (id TEXT PRIMARY KEY, amount TEXT NOT NULL, \
         n INTEGER, r REAL, note TEXT)",
    )
    .await
    .unwrap();
    pool.execute(
        "INSERT INTO t VALUES ('a', '1234.56', 1, 0.5, NULL), \
         ('b', '-7', 0, 2.0, 'x')",
    )
    .await
    .unwrap();
    pool.execute("CREATE TABLE u (id INTEGER PRIMARY KEY, v TEXT)")
        .await
        .unwrap();
    (path, pool)
}

fn st(query: &str) -> Statement {
    Statement {
        query: query.to_string(),
        params: vec![],
    }
}

#[tokio::test]
async fn returns_one_row_list_per_statement_decoded_like_the_plugin() {
    let (path, pool) = open("decode").await;
    let out = select_snapshot(
        &pool,
        &[st("SELECT * FROM t ORDER BY id"), st("SELECT * FROM u")],
    )
    .await
    .unwrap();
    let rows: Vec<Vec<Value>> = out
        .into_iter()
        .map(|rs| rs.into_iter().map(Value::Object).collect())
        .collect();
    assert_eq!(
        rows,
        vec![
            vec![
                json!({"id": "a", "amount": "1234.56", "n": 1, "r": 0.5, "note": null}),
                json!({"id": "b", "amount": "-7", "n": 0, "r": 2.0, "note": "x"}),
            ],
            vec![],
        ]
    );
    pool.close().await;
    let _ = std::fs::remove_file(path);
}

#[tokio::test]
async fn binds_parameters_and_reports_sql_errors() {
    let (path, pool) = open("errors").await;
    let out = select_snapshot(
        &pool,
        &[Statement {
            query: "SELECT id FROM t WHERE n = ?".to_string(),
            params: vec![json!(1)],
        }],
    )
    .await
    .unwrap();
    assert_eq!(out[0].len(), 1);
    assert_eq!(out[0][0]["id"], json!("a"));

    let err = select_snapshot(&pool, &[st("SELECT * FROM missing")])
        .await
        .unwrap_err()
        .to_string();
    assert!(err.contains("no such table"), "{err}");
    // The failed read leaves the pool usable.
    assert!(select_snapshot(&pool, &[st("SELECT 1 AS one")])
        .await
        .is_ok());
    pool.close().await;
    let _ = std::fs::remove_file(path);
}

#[tokio::test]
async fn decodes_by_storage_class_not_declared_type() {
    // As in the plugin: a value's type is its storage class, so a DATE-declared column
    // holding text comes back as a string.
    let (path, pool) = open("types").await;
    pool.execute("CREATE TABLE d (day DATE, flag BOOLEAN)")
        .await
        .unwrap();
    pool.execute("INSERT INTO d VALUES ('2026-06-07', 1)")
        .await
        .unwrap();
    let out = select_snapshot(&pool, &[st("SELECT day, flag FROM d")])
        .await
        .unwrap();
    assert_eq!(
        Value::Object(out[0][0].clone()),
        json!({"day": "2026-06-07", "flag": 1})
    );
    pool.close().await;
    let _ = std::fs::remove_file(path);
}
