//! Helpers the integration tests share. Each test binary includes this module
//! (`mod common;`) and uses what it needs. Everything works in temporary folders; never
//! the user's files or the real database.
#![allow(dead_code)]

use app_lib::db::Statement;
use serde_json::Value;
use sqlx::{Pool, Row, Sqlite};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

static NEXT: AtomicUsize = AtomicUsize::new(0);

/// A new, empty folder of its own under the system temp folder, removed with everything
/// in it when dropped, also when the test fails.
pub struct TempDir(PathBuf);

impl TempDir {
    pub fn new(name: &str) -> Self {
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("ret-{name}-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    pub fn join(&self, rest: impl AsRef<Path>) -> PathBuf {
        self.0.join(rest)
    }
}

/// A `&TempDir` is the folder's path wherever a `&Path` or `&PathBuf` is taken.
impl std::ops::Deref for TempDir {
    type Target = PathBuf;

    fn deref(&self) -> &PathBuf {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// The URL tauri-plugin-sql opens a database file with (created when missing).
pub fn plugin_url(path: &Path) -> String {
    format!("sqlite:{}?mode=rwc", path.display())
}

/// A database file in `dir`, opened as tauri-plugin-sql opens it.
pub async fn plugin_pool(dir: &TempDir) -> Pool<Sqlite> {
    Pool::<Sqlite>::connect(&plugin_url(&dir.join("db.sqlite")))
        .await
        .unwrap()
}

/// One statement, as the webview sends it.
pub fn st(query: &str, params: Vec<Value>) -> Statement {
    Statement {
        query: query.to_string(),
        params,
    }
}

/// The rows in `table`.
pub async fn count(pool: &Pool<Sqlite>, table: &str) -> i64 {
    sqlx::query(&format!("SELECT COUNT(*) FROM {table}"))
        .fetch_one(pool)
        .await
        .unwrap()
        .get(0)
}
