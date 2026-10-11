//! ADR 0147 decision 7 (#258 item 2): the hook `install_panic_hook` installs logs a panic
//! through `log`, then runs the hook that was there before. Its own test binary: the
//! logger and the panic hook are process-wide, and `log::set_logger` works only once.

use app_lib::crash::install_panic_hook;
use log::{Level, Log, Metadata, Record};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

/// Every record logged, as (level, target, message).
static RECORDS: Mutex<Vec<(Level, String, String)>> = Mutex::new(Vec::new());
static PREVIOUS_CALLS: AtomicUsize = AtomicUsize::new(0);

struct Capture;

impl Log for Capture {
    fn enabled(&self, _: &Metadata<'_>) -> bool {
        true
    }
    fn log(&self, record: &Record<'_>) {
        RECORDS.lock().unwrap().push((
            record.level(),
            record.target().to_string(),
            record.args().to_string(),
        ));
    }
    fn flush(&self) {}
}

static LOGGER: Capture = Capture;

#[test]
fn the_installed_hook_logs_the_panic_then_runs_the_previous_hook() {
    log::set_logger(&LOGGER).unwrap();
    log::set_max_level(log::LevelFilter::Trace);
    let original = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {
        PREVIOUS_CALLS.fetch_add(1, Ordering::SeqCst);
    }));
    install_panic_hook();

    let result = std::panic::catch_unwind(|| panic!("hook test {}", 7));
    let _ = std::panic::take_hook();
    std::panic::set_hook(original);

    assert!(result.is_err());
    let records = RECORDS.lock().unwrap().clone();
    let panics: Vec<_> = records
        .iter()
        .filter(|(_, _, m)| m.starts_with("PANIC "))
        .collect();
    assert_eq!(panics.len(), 1, "{records:?}");
    let (level, target, line) = panics[0];
    assert_eq!(*level, Level::Error);
    assert_eq!(target, "app");
    assert!(line.starts_with("PANIC hook test 7 at "), "{line}");
    assert!(line.contains("panic_hook.rs:"), "{line}");
    assert_eq!(PREVIOUS_CALLS.load(Ordering::SeqCst), 1);
}
