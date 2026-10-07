//! ADR 0147: what a panic writes to the error log.

use app_lib::crash::{panic_line, panic_text};
use std::sync::Mutex;

#[test]
fn panic_text_reads_str_and_string_payloads() {
    let s: &(dyn std::any::Any + Send) = &"static text";
    assert_eq!(panic_text(s), "static text");
    let owned: &(dyn std::any::Any + Send) = &String::from("formatted 7");
    assert_eq!(panic_text(owned), "formatted 7");
    let other: &(dyn std::any::Any + Send) = &42_u8;
    assert_eq!(panic_text(other), "a panic without a message");
}

#[test]
fn panic_line_names_the_message_and_where() {
    // The panic hook is process-wide; this is the only test in this binary that panics.
    static LINE: Mutex<String> = Mutex::new(String::new());
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(|info| {
        *LINE.lock().unwrap() = panic_line(info.payload(), info.location());
    }));
    let result = std::panic::catch_unwind(|| panic!("boom {}", "here"));
    std::panic::set_hook(previous);

    assert!(result.is_err());
    let line = LINE.lock().unwrap().clone();
    assert!(line.starts_with("PANIC boom here at "), "{line}");
    assert!(line.contains("crash.rs:"), "{line}");
}
