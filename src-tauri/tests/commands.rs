//! The capability files grant exactly the app's own commands (src/command_list.rs): one
//! `allow-<command>` each, and no grant for a command the app does not have. A command
//! without its grant is refused at run time; a stray grant is a permission left behind.
//! Every file under `capabilities/` counts, subfolders included, and must be `.json`; no
//! capability may be inline in tauri.conf.json. A permission may be written as a plain name
//! or as an object with an `identifier` (and its own scope).

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

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
    grants_under(&Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities"))
}

/// Every grant across the capability files under `dir`, subfolders included.
fn grants_under(dir: &Path) -> BTreeSet<String> {
    let files = capability_files(dir);
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

/// Every file under `dir`, sorted. tauri-build reads `capabilities/**/*` and takes `.toml`
/// (and `.json5`) as well as `.json`, so a file this reader cannot parse fails here rather
/// than granting something the checks never see.
fn capability_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut folders = vec![dir.to_path_buf()];
    while let Some(folder) = folders.pop() {
        for entry in std::fs::read_dir(&folder).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                folders.push(path);
            } else if path.extension().is_some_and(|x| x == "json") {
                files.push(path);
            } else if is_extensionless_dotfile(&path) {
                // `.DS_Store` and the like: tauri's extension filter skips them too.
            } else {
                panic!(
                    "{} is not a .json capability file; tauri may still read it, so the \
                     grant checks would miss it. Write it as .json, or teach this reader \
                     .toml / .json5 first.",
                    path.display()
                );
            }
        }
    }
    files.sort();
    files
}

/// A hidden file with no extension, such as Finder's `.DS_Store`. tauri-build globs
/// `capabilities/**/*` with hidden entries included, then keeps only files whose extension
/// it reads; `Path::extension` of `.DS_Store` is `None`, so it is skipped. A hidden
/// `.x.json` or a hidden folder is read by tauri, so it is not skipped here either.
fn is_extensionless_dotfile(path: &Path) -> bool {
    path.extension().is_none()
        && path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.starts_with('.'))
}

/// The capabilities written inline in a tauri config (`app.security.capabilities`); a
/// plain string there only references a capability by identifier.
fn inline_capabilities(config: &Value) -> Vec<&Value> {
    config["app"]["security"]["capabilities"]
        .as_array()
        .map_or_else(Vec::new, |entries| {
            entries.iter().filter(|e| !e.is_string()).collect()
        })
}

/// A fresh, empty folder for one test's fixture capability files.
fn fixture_dir(name: &str) -> PathBuf {
    let dir = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("capabilities-fixtures")
        .join(name);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn write(path: PathBuf, text: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

const PLAIN_CAPABILITY: &str = r#"{ "identifier": "default", "permissions": ["core:default"] }"#;

#[test]
fn the_reader_walks_subfolders() {
    let dir = fixture_dir("subfolder");
    write(dir.join("default.json"), PLAIN_CAPABILITY);
    write(
        dir.join("sub/x.json"),
        r#"{ "identifier": "x", "permissions": ["sql:allow-execute"] }"#,
    );
    assert!(
        grants_under(&dir).contains("sql:allow-execute"),
        "{:?}",
        grants_under(&dir)
    );
}

#[test]
#[should_panic(expected = "not a .json capability file")]
fn the_reader_refuses_a_file_that_is_not_json() {
    let dir = fixture_dir("toml");
    write(dir.join("default.json"), PLAIN_CAPABILITY);
    write(
        dir.join("x.toml"),
        "identifier = \"x\"\npermissions = [\"sql:allow-execute\"]\n",
    );
    grants_under(&dir);
}

/// Finder leaves `.DS_Store` files about. tauri skips them only because they have no
/// extension; it does read hidden folders and hidden `.json` files, so those still count.
#[test]
fn a_finder_dotfile_is_skipped_but_hidden_capabilities_count() {
    let dir = fixture_dir("dotfiles");
    write(dir.join("default.json"), PLAIN_CAPABILITY);
    write(dir.join(".DS_Store"), "\0\0\0\x01Bud1");
    write(dir.join("sub/.DS_Store"), "\0\0\0\x01Bud1");
    write(
        dir.join(".hidden/x.json"),
        r#"{ "identifier": "x", "permissions": ["sql:allow-execute"] }"#,
    );
    let want: BTreeSet<String> = ["core:default", "sql:allow-execute"]
        .map(String::from)
        .into();
    assert_eq!(grants_under(&dir), want);
}

#[test]
fn an_inline_capability_in_the_config_is_found() {
    let config = json!({ "app": { "security": { "capabilities": [
        "default",
        { "identifier": "inline", "permissions": ["sql:allow-execute"] }
    ] } } });
    assert_eq!(inline_capabilities(&config).len(), 1);
}

/// tauri also reads capabilities written inline in tauri.conf.json; this app keeps them all
/// in capabilities/, where the grant checks above read them. A plain identifier string
/// (a reference to a capability file) is fine.
#[test]
fn the_config_has_no_inline_capability() {
    let text =
        std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json"))
            .unwrap();
    let config: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(inline_capabilities(&config), Vec::<&Value>::new());
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
