// The UI's door to the platform layer (ADR 0072): file saving, native menu events and labels.
// Re-exports only; the wrappers live in src/platform.
export { saveFile, type SaveOutcome } from "../platform/saveFile";
export { onMenuEvent } from "../platform/menuEvents";
export { setMenuLabels } from "../platform/menuLabels";
export { revealDataDir } from "../platform/revealDataDir";
