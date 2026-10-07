// The frozen browser clock, shared by the capture fixture (helpers.ts) and the summary
// (summary.ts), which runs as global teardown and so does not load the fixture.

/** Frozen "now" so runs are comparable before/after (override with UX_DATE). */
export const UX_DATE = process.env.UX_DATE ?? "2026-10-01T10:00:00Z";
