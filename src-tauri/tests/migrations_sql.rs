//! #118 (R3-10): the real migration SQL on the SQLite that sqlx bundles, which is the one
//! the app ships. Every Vitest migration test runs on better-sqlite3's newer SQLite, so
//! SQL that only a newer engine accepts would otherwise pass CI and fail on first launch.
//! The fixture is generated from `src/data/migrations.ts` and kept in step by
//! `src/data/__tests__/migrationsFixture.test.ts`. Only the DDL is covered here: a
//! migration's `precheck` and `build` run in TypeScript. Never touches the real database.

use app_lib::db::{run_atomic, Statement};
use serde_json::Value;
use sqlx::{Executor, Pool, Row, Sqlite};
use std::path::PathBuf;

const FIXTURE: &str = include_str!("fixtures/migrations.json");

fn temp_path(name: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "ret-migrations-{}-{}.sqlite",
        name,
        std::process::id()
    ));
    let _ = std::fs::remove_file(&path);
    path
}

async fn open(name: &str) -> (PathBuf, Pool<Sqlite>) {
    let path = temp_path(name);
    let pool = Pool::<Sqlite>::connect(&format!("sqlite:{}?mode=rwc", path.display()))
        .await
        .unwrap();
    (path, pool)
}

async fn cleanup(path: PathBuf, pool: Pool<Sqlite>) {
    pool.close().await;
    let _ = std::fs::remove_file(path);
}

async fn count(pool: &Pool<Sqlite>, table: &str) -> i64 {
    sqlx::query(&format!("SELECT COUNT(*) FROM {table}"))
        .fetch_one(pool)
        .await
        .unwrap()
        .get(0)
}

/// Synthetic rows that the v1 schema accepts (the same values as `fill()` in
/// `src/data/__tests__/migrations.test.ts`), so every later migration, the v7 table
/// rebuild included, runs over real data.
const V1_ROWS: &str = "
    INSERT INTO properties (id, name, address, type, size_m2, garage, purchase_date, purchase_price, appreciation_override_pa) VALUES ('p1', 'Flat One', 'Street 1', '2+kk', 55, 1, '2023-02-01', '7500000.50', '0.03');
    INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES ('p2', 'Flat Two', '2024-05-10', '4200000');
    INSERT INTO mortgage_blocks (id, property_id, start_date, initial_principal, fixation_years, interest_rate_pa, monthly_instalment) VALUES ('m1', 'p1', '2023-02-01', '5000000', 5, '0.0449', '21576.4');
    INSERT INTO valuations (id, property_id, valid_from, valid_to, market_value) VALUES ('v1', 'p1', '2023-02-01', '2025-12-31', '7600000'), ('v2', 'p1', '2026-01-01', NULL, '8100000');
    INSERT INTO leases (id, property_id, start_date, end_date, monthly_rent) VALUES ('l1', 'p1', '2023-03-01', '2024-02-29', '22000'), ('l2', 'p1', '2024-03-01', NULL, '23500');
    INSERT INTO holding_costs (id, property_id, property_tax_yr, mgmt_pct_rent) VALUES ('hc-p1', 'p1', '2400', '0.05'), ('hc-p2', 'p2', NULL, NULL);
    INSERT INTO assumptions VALUES (1, '2026-06-07', '0.03', '0.025', '0.04', '0.055', 30, '0.025', '2000', '3000', '0.0', '0.05', '1500', '0');
    INSERT INTO scenarios (id, name, overrides, created_at) VALUES ('s1', 'Stress', '{\"appreciationPa\":\"0.01\"}', '2026-01-05');
";

const ROW_COUNTS: [(&str, i64); 7] = [
    ("properties", 2),
    ("mortgage_blocks", 1),
    ("valuations", 2),
    ("leases", 2),
    ("holding_costs", 2),
    ("assumptions", 1),
    ("scenarios", 1),
];

/// Applies one migration as the app does: its SQL as one multi-statement text inside a
/// transaction (DR-084), with foreign keys off for a table rebuild. Empty SQL is
/// skipped, as `migrationText` skips it.
async fn apply(pool: &Pool<Sqlite>, migration: &Value) {
    let version = migration["version"].as_i64().unwrap();
    let name = migration["name"].as_str().unwrap();
    let sql = migration["sql"].as_str().unwrap();
    let fk_off = migration["foreignKeysOff"].as_bool().unwrap();
    if sql.trim().is_empty() {
        return;
    }
    let statement = Statement {
        query: sql.to_string(),
        params: vec![],
    };
    if let Err(e) = run_atomic(pool, &[statement], fk_off).await {
        panic!("migration v{version} ({name}) failed on the bundled SQLite: {e}");
    }
}

#[tokio::test]
async fn every_migration_runs_on_the_bundled_sqlite_and_keeps_the_rows() {
    let fixture: Value = serde_json::from_str(FIXTURE).unwrap();
    let migrations = fixture["migrations"].as_array().unwrap();
    let (path, pool) = open("all").await;
    let version: String = sqlx::query("SELECT sqlite_version()")
        .fetch_one(&pool)
        .await
        .unwrap()
        .get(0);
    println!("bundled SQLite {version}");

    apply(&pool, &migrations[0]).await;
    pool.execute(V1_ROWS).await.unwrap();
    for migration in &migrations[1..] {
        apply(&pool, migration).await;
    }

    let integrity: String = sqlx::query("PRAGMA integrity_check")
        .fetch_one(&pool)
        .await
        .unwrap()
        .get(0);
    assert_eq!(integrity, "ok");
    let fk_problems = sqlx::query("PRAGMA foreign_key_check")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert!(fk_problems.is_empty(), "foreign_key_check reported rows");
    for (table, rows) in ROW_COUNTS {
        assert_eq!(count(&pool, table).await, rows, "rows kept in {table}");
    }

    let head = fixture["headColumns"].as_object().unwrap();
    for (table, columns) in head {
        let want: Vec<&str> = columns
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c.as_str().unwrap())
            .collect();
        let have: Vec<String> = sqlx::query("SELECT name FROM pragma_table_info(?) ORDER BY cid")
            .bind(table)
            .fetch_all(&pool)
            .await
            .unwrap()
            .iter()
            .map(|r| r.get(0))
            .collect();
        assert_eq!(have, want, "head columns of {table}");
    }
    cleanup(path, pool).await;
}

#[tokio::test]
async fn a_fresh_database_reaches_the_head_schema() {
    let fixture: Value = serde_json::from_str(FIXTURE).unwrap();
    let (path, pool) = open("fresh").await;
    for migration in fixture["migrations"].as_array().unwrap() {
        apply(&pool, migration).await;
    }
    let head = fixture["headColumns"].as_object().unwrap();
    for table in head.keys() {
        assert_eq!(count(&pool, table).await, 0, "{table} exists and is empty");
    }
    cleanup(path, pool).await;
}

/// ADR 0119 (v10): the funding columns' textual sign checks hold on the bundled SQLite.
#[tokio::test]
async fn the_funding_sign_checks_hold_on_the_bundled_sqlite() {
    let fixture: Value = serde_json::from_str(FIXTURE).unwrap();
    let (path, pool) = open("funding").await;
    for migration in fixture["migrations"].as_array().unwrap() {
        apply(&pool, migration).await;
    }
    pool.execute(
        "INSERT INTO properties (id, name, purchase_date, purchase_price, own_cash, transaction_costs, initial_works, funding_note) \
         VALUES ('p1', 'Flat One', '2023-02-01', '6375000', '1500000', '0', NULL, 'Deposit')",
    )
    .await
    .unwrap();
    for column in ["own_cash", "transaction_costs", "initial_works"] {
        let err = pool
            .execute(format!("UPDATE properties SET {column} = '-1'").as_str())
            .await
            .unwrap_err()
            .to_string();
        assert!(
            err.contains(&format!("property_{column}_not_negative")),
            "{column}: {err}"
        );
    }
    cleanup(path, pool).await;
}
