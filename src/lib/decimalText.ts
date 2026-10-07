// The plain decimal notation CSV import accepts (DR-036): an optional minus, digits and an
// optional fraction after a `.` — no exponent, hex, `+`, `Infinity` or grouping.

export const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;
