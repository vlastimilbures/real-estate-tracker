//! The capability files grant exactly the app's own commands (src/command_list.rs): one
//! `allow-<command>` each, and no grant for a command the app does not have. A command
//! without its grant is refused at run time; a stray grant is a permission left behind.
//! Every `capabilities/*.json` counts, and a permission may be written as a plain name or
//! as an object with an `identifier` (and its own scope).

use std::collections::BTreeSet;
use std::path::Path;

use app_lib::command_names;
use serde_json::{json, Value};

/// A permission entry's identifier: the string itself, or an object's `identifier`.
fn identifier(entry: &Value) -> &str {
    entry
        .as_str()
        .or_else(|| entry["identifier"].as_str())
        .unwrap_or_else(|| panic!("a permission without an identifier: {entry}"))
}

/// The `allow-*` grants without a plugin prefix in one capability: the app's own commands.
fn app_grants_in(capability: &Value) -> BTreeSet<String> {
    grants_in(capability)
        .into_iter()
        .filter(|p| !p.contains(':'))
        .collect()
}

/// Every grant in one capability, plugin grants included.
fn grants_in(capability: &Value) -> BTreeSet<String> {
    capability["permissions"]
        .as_array()
        .expect("a permissions list")
        .iter()
        .map(|p| identifier(p).to_owned())
        .collect()
}

/// The app's own grants across every capability file.
fn app_grants() -> BTreeSet<String> {
    all_grants()
        .into_iter()
        .filter(|p| !p.contains(':'))
        .collect()
}

#[test]
fn every_command_is_granted_and_nothing_else() {
    let wanted: BTreeSet<String> = command_names()
        .iter()
        .map(|c| format!("allow-{}", c.replace('_', "-")))
        .collect();
    assert_eq!(app_grants(), wanted);
}

/// Every grant across the capability files, plugin grants included.
fn all_grants() -> BTreeSet<String> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
    let mut files: Vec<_> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    files.sort();
    assert!(!files.is_empty(), "no capability file in {}", dir.display());
    files
        .iter()
        .flat_map(|f| {
            let text = std::fs::read_to_string(f).unwrap();
            let capability: Value =
                serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", f.display()));
            grants_in(&capability)
        })
        .collect()
}

/// ADR 0270: every write goes through the app's commands (`db_execute`,
/// `db_transaction`), so the SQL plugin keeps only what the webview still calls:
/// `Database.load` and `select` (src/data/tauriSql.ts). Its `execute` is not granted.
#[test]
fn the_sql_plugin_grants_only_load_and_select() {
    let sql: BTreeSet<String> = all_grants()
        .into_iter()
        .filter(|p| p.starts_with("sql:"))
        .collect();
    let want: BTreeSet<String> = ["sql:allow-load", "sql:allow-select"]
        .map(String::from)
        .into();
    assert_eq!(sql, want);
}

#[test]
fn each_command_is_listed_once() {
    let names = command_names();
    let unique: BTreeSet<&str> = names.iter().copied().collect();
    assert_eq!(unique.len(), names.len(), "{names:?}");
}

#[test]
fn an_object_entry_counts_by_its_identifier() {
    let capability = json!({
        "permissions": [
            "allow-perf-enabled",
            { "identifier": "allow-save-file", "allow": [{ "path": "$HOME/x" }] },
            { "identifier": "fs:allow-read" },
            "core:default"
        ]
    });
    let want: BTreeSet<String> = ["allow-perf-enabled", "allow-save-file"]
        .map(String::from)
        .into();
    assert_eq!(app_grants_in(&capability), want);
}
