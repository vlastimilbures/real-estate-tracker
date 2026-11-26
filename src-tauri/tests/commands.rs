//! The capability file grants exactly the app's own commands (src/command_list.rs): one
//! `allow-<command>` each, and no grant for a command the app does not have. A command
//! without its grant is refused at run time; a stray grant is a permission left behind.

use std::collections::BTreeSet;

use app_lib::command_names;

const CAPABILITIES: &str = include_str!("../capabilities/default.json");

/// The `allow-*` grants without a plugin prefix: those are the app's own commands.
fn app_grants() -> BTreeSet<String> {
    let file: serde_json::Value = serde_json::from_str(CAPABILITIES).unwrap();
    file["permissions"]
        .as_array()
        .expect("a permissions list")
        .iter()
        .map(|p| p.as_str().expect("a plain permission name").to_owned())
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

#[test]
fn each_command_is_listed_once() {
    let names = command_names();
    let unique: BTreeSet<&str> = names.iter().copied().collect();
    assert_eq!(unique.len(), names.len(), "{names:?}");
}
