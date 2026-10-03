//! Startup and interaction timings (P9, D-66). The webview reports a named mark (and
//! optionally a measured duration); this prints one line to stderr with the time since
//! the app process started `run()`. Nothing is written to disk or sent anywhere: the
//! line is visible only when the app binary is started from a terminal.

use std::time::Instant;
use tauri::State;

/// When `run()` started: the zero point for every reported mark.
pub struct Started(pub Instant);

impl Started {
    pub fn now() -> Self {
        Self(Instant::now())
    }
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

#[tauri::command]
pub fn perf_report(started: State<'_, Started>, name: String, ms: Option<f64>) {
    eprintln!("{}", perf_line(&name, started.0.elapsed().as_millis(), ms));
}

#[cfg(test)]
mod tests {
    use super::perf_line;

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
}
