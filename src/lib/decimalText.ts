// The plain decimal notation CSV import accepts: an optional minus, digits and an
// optional fraction after a `.` — no exponent, hex, `+`, `Infinity` or grouping.

export const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;
