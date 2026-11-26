//! ADR 0270 point 3: a write SQLite refuses for a constraint fails with the constraint's
//! fields, read from SQLite's extended result code and its own message, on both write
//! paths (`execute_one`, `run_atomic`). Temporary file databases opened as
//! tauri-plugin-sql opens them; never the real database.

use app_lib::db::{execute_one, run_atomic, Statement};
use app_lib::error::AppError;
use serde_json::{json, Value};
use sqlx::{Executor, Pool, Sqlite};

mod common;
use common::{plugin_pool, st, TempDir};

async fn open(name: &str) -> (TempDir, Pool<Sqlite>) {
    let dir = TempDir::new(&format!("constraints-{name}"));
    let pool = plugin_pool(&dir).await;
    for q in [
        "CREATE TABLE p (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, \
         n TEXT CONSTRAINT p_n_not_negative CHECK (n NOT GLOB '-*'))",
        "CREATE TABLE v (id TEXT PRIMARY KEY, p_id TEXT NOT NULL REFERENCES p(id), \
         d TEXT NOT NULL, UNIQUE (p_id, d))",
        "INSERT INTO p (id, name) VALUES ('a', 'A')",
        "INSERT INTO v (id, p_id, d) VALUES ('v1', 'a', '2026-01-01')",
    ] {
        pool.execute(q).await.unwrap();
    }
    (dir, pool)
}

fn wire(e: &AppError) -> Value {
    serde_json::to_value(e).unwrap()
}

/// Each refused write, the constraint it sends, and the table text its detail keeps.
fn cases() -> Vec<(Statement, Value, &'static str)> {
    vec![
        (
            st("INSERT INTO p (id, name) VALUES ('b', 'A')", vec![]),
            json!({ "kind": "unique", "table": "p", "columns": ["name"] }),
            "UNIQUE constraint failed: p.name",
        ),
        (
            st("INSERT INTO p (id, name) VALUES ('a', 'Z')", vec![]),
            json!({ "kind": "unique", "table": "p", "columns": ["id"] }),
            "UNIQUE constraint failed: p.id",
        ),
        (
            st(
                "INSERT INTO v (id, p_id, d) VALUES ('v2', 'a', '2026-01-01')",
                vec![],
            ),
            json!({ "kind": "unique", "table": "v", "columns": ["p_id", "d"] }),
            "UNIQUE constraint failed: v.p_id, v.d",
        ),
        (
            st(
                "INSERT INTO p (id, name) VALUES ('c', ?)",
                vec![Value::Null],
            ),
            json!({ "kind": "notNull", "table": "p", "columns": ["name"] }),
            "NOT NULL constraint failed: p.name",
        ),
        (
            st("UPDATE p SET n = '-5' WHERE id = 'a'", vec![]),
            json!({ "kind": "check", "check": "p_n_not_negative" }),
            "CHECK constraint failed: p_n_not_negative",
        ),
        (
            st(
                "INSERT INTO v (id, p_id, d) VALUES ('v3', 'nope', '2026-01-01')",
                vec![],
            ),
            json!({ "kind": "foreignKey" }),
            "FOREIGN KEY constraint failed",
        ),
    ]
}

#[tokio::test]
async fn a_single_statement_sends_its_constraint() {
    let (dir, pool) = open("execute").await;
    for (statement, constraint, text) in cases() {
        let e = execute_one(&pool, &statement).await.unwrap_err();
        let w = wire(&e);
        assert_eq!(w["code"], "SQL", "{text}");
        assert_eq!(w["constraint"], constraint, "{text}");
        // The detail is sqlx's text, as before.
        let detail = w["detail"].as_str().unwrap();
        assert!(
            detail.starts_with("error returned from database: (code: "),
            "{detail}"
        );
        assert!(detail.ends_with(text), "{detail}");
    }
    pool.close().await;
    drop(dir);
}

#[tokio::test]
async fn a_transaction_sends_its_constraint() {
    let (dir, pool) = open("transaction").await;
    for (statement, constraint, text) in cases() {
        let e = run_atomic(&pool, &[statement]).await.unwrap_err();
        assert_eq!(wire(&e)["constraint"], constraint, "{text}");
    }
    pool.close().await;
    drop(dir);
}

#[tokio::test]
async fn any_other_sql_failure_sends_no_constraint() {
    let (dir, pool) = open("other").await;
    let e = execute_one(&pool, &st("INSERT INTO missing VALUES (1)", vec![]))
        .await
        .unwrap_err();
    let w = wire(&e);
    assert_eq!(w["code"], "SQL");
    assert!(w.get("constraint").is_none(), "{w}");
    pool.close().await;
    drop(dir);
}
