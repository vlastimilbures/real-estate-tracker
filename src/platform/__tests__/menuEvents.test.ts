import { describe, it, expect, vi } from "vitest";

const listen = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({ listen }));

const { onMenuEvent } = await import("../menuEvents");

describe("onMenuEvent", () => {
  it("subscribes to the named menu event and returns the unlisten promise", async () => {
    const off = vi.fn();
    listen.mockResolvedValueOnce(off);
    const handler = vi.fn();
    const unlisten = onMenuEvent("menu://about", handler);
    expect(listen).toHaveBeenCalledWith("menu://about", handler);
    expect(await unlisten).toBe(off);
  });
});
