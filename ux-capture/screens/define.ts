// One screen of the capture manifest: an id, what it shows and how to get there. The id
// is written once: `ux.capture()` inside `run` captures under it.
import type { Ux } from "../helpers";

type CaptureOpts = Parameters<Ux["capture"]>[1];

/** `Ux` for one screen: `capture()` saves under the screen's id; `capture(id)` saves an
 *  extra state under its own id (the file name). */
export interface ScreenUx extends Omit<Ux, "capture"> {
  capture(opts?: CaptureOpts): Promise<void>;
  capture(id: string, opts?: CaptureOpts): Promise<void>;
}

export interface Screen {
  id: string;
  /** What the capture shows (the test title in the capture run). */
  desc: string;
  run: (ux: Ux) => Promise<void>;
}

export function forScreen(ux: Ux, id: string): ScreenUx {
  function capture(opts?: CaptureOpts): Promise<void>;
  function capture(state: string, opts?: CaptureOpts): Promise<void>;
  function capture(a?: string | CaptureOpts, b?: CaptureOpts) {
    return typeof a === "string" ? ux.capture(a, b) : ux.capture(id, a);
  }
  return { ...ux, capture };
}

export function defineScreen(
  id: string,
  desc: string,
  run: (ux: ScreenUx) => Promise<void>,
): Screen {
  return { id, desc, run: (ux) => run(forScreen(ux, id)) };
}
