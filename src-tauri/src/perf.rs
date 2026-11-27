//! Startup and interaction timings (ADR 0066, ADR 0233). The webview reports a named mark
//! (and optionally a measured duration); this prints one line to stderr with the time
//! since the app process started `run()`. Nothing is written to disk or sent anywhere: the
//! line is visible only when the app binary is started from a terminal.
//!
//! Timing is on in development builds, and in the release build only when the process is
//! started with `RTRACKER_PERF=1` (read once in `run()`). The webview asks `perf_enabled`
//! once before its first render; `perf_report` ignores calls while timing is off.

use std::ffi::OsStr;
use std::time::Instant;
use tauri::State;

/// The timing state, read once in `run()`: the zero point for every reported mark, and
/// whether timing is on.
pub struct Perf {
    started: Instant,
    enabled: bool,
}

impl Perf {
    pub fn new(enabled: bool) -> Self {
        Self {
            started: Instant::now(),
            enabled,
        }
    }
}

/// Whether timing is on: always in a debug build, otherwise only when `RTRACKER_PERF`
/// (`var`) is exactly `1`.
pub fn enabled_from(var: Option<&OsStr>, debug: bool) -> bool {
    debug || var == Some(OsStr::new("1"))
}

/// The stderr line for mark `name` reached `since_start_ms` after start, with an
/// optional measured duration. The name is capped and restricted to `[A-Za-z0-9:_-]`.
pub fn perf_line(name: &str, since_start_ms: u128, measure_ms: Option<f64>) -> String {
    let name: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '_' | '-'))
        .take(64)
        .collect();
    match measure_ms {
        Some(ms) if ms.is_finite() => {
            format!("perf {name} since_start_ms={since_start_ms} measure_ms={ms:.1}")
        }
        _ => format!("perf {name} since_start_ms={since_start_ms}"),
    }
}

/// The line `perf_report` prints, or none while timing is off.
pub fn report_line(
    enabled: bool,
    name: &str,
    since_start_ms: u128,
    measure_ms: Option<f64>,
) -> Option<String> {
    enabled.then(|| perf_line(name, since_start_ms, measure_ms))
}

#[tauri::command]
pub fn perf_enabled(perf: State<'_, Perf>) -> bool {
    perf.enabled
}

#[tauri::command]
pub fn perf_report(perf: State<'_, Perf>, name: String, ms: Option<f64>) {
    let since_start_ms = perf.started.elapsed().as_millis();
    if let Some(line) = report_line(perf.enabled, &name, since_start_ms, ms) {
        eprintln!("{line}");
    }
}

#[cfg(test)]
mod tests {
    use super::{enabled_from, perf_line, report_line};
    use std::ffi::OsStr;

    #[test]
    fn formats_a_mark_and_a_measure() {
        assert_eq!(
            perf_line("dashboard-rendered", 812, None),
            "perf dashboard-rendered since_start_ms=812"
        );
        assert_eq!(
            perf_line("engine-recompute", 900, Some(12.345)),
            "perf engine-recompute since_start_ms=900 measure_ms=12.3"
        );
    }

    #[test]
    fn sanitises_the_name_and_drops_a_non_finite_measure() {
        assert_eq!(
            perf_line("a b\nc", 1, Some(f64::NAN)),
            "perf abc since_start_ms=1"
        );
        assert_eq!(
            perf_line(&"x".repeat(100), 1, None).len(),
            "perf ".len() + 64 + " since_start_ms=1".len()
        );
    }

    // ADR 0233: the variable is passed in, never set in the process env (parallel-safe).
    #[test]
    fn a_release_build_measures_only_when_the_variable_is_exactly_one() {
        assert!(!enabled_from(None, false));
        assert!(enabled_from(Some(OsStr::new("1")), false));
        assert!(!enabled_from(Some(OsStr::new("0")), false));
        assert!(!enabled_from(Some(OsStr::new("")), false));
        assert!(!enabled_from(Some(OsStr::new("true")), false));
    }

    #[test]
    fn a_debug_build_always_measures() {
        assert!(enabled_from(None, true));
    }

    #[test]
    fn reports_nothing_while_off_and_todays_lines_while_on() {
        assert_eq!(report_line(false, "dashboard-rendered", 812, None), None);
        assert_eq!(
            report_line(false, "engine-recompute", 900, Some(12.3)),
            None
        );
        assert_eq!(
            report_line(true, "dashboard-rendered", 812, None).as_deref(),
            Some("perf dashboard-rendered since_start_ms=812")
        );
        assert_eq!(
            report_line(true, "engine-recompute", 900, Some(12.345)).as_deref(),
            Some("perf engine-recompute since_start_ms=900 measure_ms=12.3")
        );
    }
}
