//! #471: the Sql seam's contract against the app's own commands (`run_atomic`,
//! `select_snapshot`). The scenarios are src/data/__tests__/fixtures/sql-contract.json,
//! which src/data/__tests__/sqlContract.test.ts runs against the better-sqlite3 test
//! adapter, so both adapters answer the same questions. Temporary file databases opened
//! as tauri-plugin-sql opens them; never the real database.

use app_lib::db::{run_atomic, select_snapshot, Statement};
use serde_json::Value;
use sqlx::{Executor, Pool, Row, Sqlite};
use std::path::PathBuf;

const CONTRACT: &str = include_str!("../../src/data/__tests__/fixtures/sql-contract.json");

fn contract() -> Value {
    serde_json::from_str(CONTRACT).unwrap()
}

fn statements(v: &Value) -> Vec<Statement> {
    v.as_array()
        .map(|list| {
            list.iter()
                .map(|s| Statement {
                    query: s["query"].as_str().unwrap().to_string(),
                    params: s["params"].as_array().cloned().unwrap_or_default(),
                })
                .collect()
        })
        .unwrap_or_default()
}

async fn fresh(c: &Value, kind: &str, i: usize, setup: &Value) -> (PathBuf, Pool<Sqlite>) {
    let path = std::env::temp_dir().join(format!(
        "ret-dbcontract-{kind}-{i}-{}.sqlite",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&path);
    let pool = Pool::<Sqlite>::connect(&format!("sqlite:{}?mode=rwc", path.display()))
        .await
        .unwrap();
    for q in c["schema"].as_array().unwrap() {
        pool.execute(q.as_str().unwrap()).await.unwrap();
    }
    let setup = statements(setup);
    if !setup.is_empty() {
        run_atomic(&pool, &setup).await.unwrap();
    }
    (path, pool)
}

async fn cleanup(path: PathBuf, pool: Pool<Sqlite>) {
    pool.close().await;
    let _ = std::fs::remove_file(path);
}

#[tokio::test]
async fn transactions_match_the_contract() {
    let c = contract();
    for (i, s) in c["transactions"].as_array().unwrap().iter().enumerate() {
        let name = s["name"].as_str().unwrap();
        let (path, pool) = fresh(&c, "tx", i, &s["setup"]).await;
        let outcome = run_atomic(&pool, &statements(&s["statements"])).await;
        match s["error"].as_str() {
            None => assert!(outcome.is_ok(), "{name}: {outcome:?}"),
            Some(expected) => {
                let err = outcome.expect_err(name).to_string();
                assert!(err.contains(expected), "{name}: {err}");
            }
        }
        for (table, n) in s["counts"].as_object().unwrap() {
            let got: i64 = sqlx::query(&format!("SELECT COUNT(*) FROM {table}"))
                .fetch_one(&pool)
                .await
                .unwrap()
                .get(0);
            assert_eq!(Some(got), n.as_i64(), "{name}: {table}");
        }
        cleanup(path, pool).await;
    }
}

#[tokio::test]
async fn snapshots_match_the_contract() {
    let c = contract();
    for (i, s) in c["snapshots"].as_array().unwrap().iter().enumerate() {
        let name = s["name"].as_str().unwrap();
        let (path, pool) = fresh(&c, "snap", i, &s["setup"]).await;
        let outcome = select_snapshot(&pool, &statements(&s["statements"])).await;
        match s["error"].as_str() {
            None => {
                let rows = serde_json::to_value(outcome.expect(name)).unwrap();
                assert_eq!(rows, s["expected"], "{name}");
            }
            Some(expected) => {
                let err = outcome.expect_err(name).to_string();
                assert!(err.contains(expected), "{name}: {err}");
            }
        }
        cleanup(path, pool).await;
    }
}
