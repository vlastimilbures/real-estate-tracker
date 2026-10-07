//! P8 (D-64): the file helpers behind src/files.rs, against temporary folders. Never
//! touches the user's files.

use app_lib::files::{
    atomic_write, atomic_write_private, percent_decode, restrict_app_dir, restrict_dir,
    valid_backup_name, write_verified,
};
use std::fs;
use std::path::PathBuf;

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("ret-files-{}-{}", name, std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn entries(dir: &PathBuf) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

#[test]
fn atomic_write_creates_the_file_and_leaves_no_temp() {
    let dir = temp_dir("create");
    let dest = dir.join("p.xlsx");
    atomic_write(&dest, &[1, 2, 3]).unwrap();
    assert_eq!(fs::read(&dest).unwrap(), vec![1, 2, 3]);
    assert_eq!(entries(&dir), vec!["p.xlsx"]);
}

#[test]
fn atomic_write_replaces_an_existing_file_whole() {
    let dir = temp_dir("replace");
    let dest = dir.join("backup.json");
    fs::write(&dest, "a much longer old content").unwrap();
    atomic_write(&dest, b"new").unwrap();
    assert_eq!(fs::read_to_string(&dest).unwrap(), "new");
    assert_eq!(entries(&dir), vec!["backup.json"]);
}

#[test]
fn atomic_write_failure_leaves_the_target_untouched_and_no_temp() {
    let dir = temp_dir("fail");
    // The target is a non-empty folder, so the final rename must fail.
    let dest = dir.join("taken");
    fs::create_dir(&dest).unwrap();
    fs::write(dest.join("keep.txt"), "kept").unwrap();
    let err = atomic_write(&dest, b"data").unwrap_err().to_string();
    assert!(!err.is_empty());
    assert_eq!(fs::read_to_string(dest.join("keep.txt")).unwrap(), "kept");
    assert_eq!(entries(&dir), vec!["taken"]);
}

#[test]
fn atomic_write_into_a_missing_folder_fails_with_its_reason() {
    let dir = temp_dir("missing");
    let err = atomic_write(&dir.join("nope").join("x.csv"), b"a,b")
        .unwrap_err()
        .to_string();
    assert!(err.contains("No such file"), "{err}");
}

#[test]
fn write_verified_reads_the_file_back() {
    let dir = temp_dir("verified");
    let dest = dir.join("t.csv");
    write_verified(&dest, "název;Kč\n".as_bytes()).unwrap();
    assert_eq!(fs::read_to_string(&dest).unwrap(), "název;Kč\n");
}

#[test]
fn percent_decode_reverses_encode_uri_component() {
    // encodeURIComponent('{"filename":"Přehled 2026.xlsx"}')
    let encoded = "%7B%22filename%22%3A%22P%C5%99ehled%202026.xlsx%22%7D";
    assert_eq!(
        percent_decode(encoded).unwrap(),
        r#"{"filename":"Přehled 2026.xlsx"}"#
    );
    assert!(percent_decode("%zz").is_err());
    assert!(percent_decode("%4").is_err());
}

#[test]
fn backup_names_stay_inside_the_backups_folder() {
    assert!(valid_backup_name(
        "portfolio-before-restore-20261001T120000Z.json"
    ));
    assert!(!valid_backup_name("../escape.json"));
    assert!(!valid_backup_name("a/b.json"));
    assert!(!valid_backup_name(".hidden.json"));
    assert!(!valid_backup_name("portfolio.db"));
    assert!(!valid_backup_name(""));
}

// DR-157 (ADR 0080): the app's own files are private to the user.
#[cfg(unix)]
fn mode(path: &std::path::Path) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(path).unwrap().permissions().mode() & 0o777
}

#[cfg(unix)]
fn set_mode(path: &std::path::Path, m: u32) {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(m)).unwrap();
}

#[cfg(unix)]
#[test]
fn atomic_write_private_creates_the_file_0600() {
    let dir = temp_dir("private");
    let dest = dir.join("portfolio-before-restore.json");
    atomic_write_private(&dest, b"{}").unwrap();
    assert_eq!(fs::read(&dest).unwrap(), b"{}");
    assert_eq!(mode(&dest), 0o600);
    assert_eq!(entries(&dir), vec!["portfolio-before-restore.json"]);
}

#[cfg(unix)]
#[test]
fn atomic_write_keeps_the_default_mode_for_exports() {
    let dir = temp_dir("export-mode");
    let dest = dir.join("p.xlsx");
    atomic_write(&dest, b"x").unwrap();
    assert_ne!(mode(&dest), 0o600);
}

#[cfg(unix)]
#[test]
fn restrict_app_dir_makes_folders_0700_and_files_0600() {
    let dir = temp_dir("restrict");
    let backups = dir.join("backups");
    fs::create_dir(&backups).unwrap();
    for f in ["portfolio.db", "portfolio.db-wal", ".window-state.json"] {
        fs::write(dir.join(f), "x").unwrap();
        set_mode(&dir.join(f), 0o644);
    }
    fs::write(backups.join("pre-v9.sqlite"), "x").unwrap();
    set_mode(&backups.join("pre-v9.sqlite"), 0o644);
    set_mode(&backups, 0o755);
    set_mode(&dir, 0o755);
    // A symlink is left alone (its target may be outside the folder).
    let outside = temp_dir("restrict-outside").join("shared.txt");
    fs::write(&outside, "x").unwrap();
    set_mode(&outside, 0o644);
    std::os::unix::fs::symlink(&outside, dir.join("link")).unwrap();

    restrict_app_dir(&dir).unwrap();

    assert_eq!(mode(&dir), 0o700);
    assert_eq!(mode(&backups), 0o700);
    for f in ["portfolio.db", "portfolio.db-wal", ".window-state.json"] {
        assert_eq!(mode(&dir.join(f)), 0o600, "{f}");
    }
    assert_eq!(mode(&backups.join("pre-v9.sqlite")), 0o600);
    assert_eq!(mode(&outside), 0o644);
}

#[test]
fn restrict_app_dir_ignores_a_missing_folder() {
    let dir = temp_dir("restrict-missing").join("not-yet");
    restrict_app_dir(&dir).unwrap();
    assert!(!dir.exists());
}

#[cfg(unix)]
#[test]
fn restrict_dir_makes_one_folder_0700_and_its_files_0600() {
    let dir = temp_dir("restrict-dir");
    let sub = dir.join("sub");
    fs::create_dir(&sub).unwrap();
    set_mode(&sub, 0o755);
    for f in ["app.log", "app_2026-10-07_09-00-00.log"] {
        fs::write(dir.join(f), "x").unwrap();
        set_mode(&dir.join(f), 0o644);
    }
    set_mode(&dir, 0o755);

    restrict_dir(&dir).unwrap();

    assert_eq!(mode(&dir), 0o700);
    for f in ["app.log", "app_2026-10-07_09-00-00.log"] {
        assert_eq!(mode(&dir.join(f)), 0o600, "{f}");
    }
    // Not recursive: a subfolder keeps its mode.
    assert_eq!(mode(&sub), 0o755);
}

#[test]
fn restrict_dir_ignores_a_missing_folder() {
    let dir = temp_dir("restrict-dir-missing").join("not-yet");
    restrict_dir(&dir).unwrap();
    assert!(!dir.exists());
}
