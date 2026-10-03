// exportTableXlsx hands the built workbook to saveFile (moved out of ui/model, DR-066).
import { describe, it, expect, vi } from "vitest";
import { exportTableXlsx } from "../exportXlsx";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../platform/saveFile", () => ({ saveFile: save }));

describe("exportTableXlsx", () => {
  it("saves the workbook bytes as an .xlsx and returns the outcome", async () => {
    save.mockResolvedValue({ kind: "saved", filename: "p.xlsx" });
    const outcome = await exportTableXlsx({
      filename: "p.xlsx",
      sheetName: "S",
      columns: [{ header: "N", kind: "int", value: (r: number) => r }],
      rows: [1, 2],
    });
    expect(outcome).toEqual({ kind: "saved", filename: "p.xlsx" });
    const [opts] = save.mock.calls[0] as [
      { filename: string; data: Uint8Array; mime: string; filter: unknown },
    ];
    expect(opts.filename).toBe("p.xlsx");
    expect(opts.data).toBeInstanceOf(Uint8Array);
    expect(opts.data.length).toBeGreaterThan(0);
    expect(opts.mime).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(opts.filter).toEqual({
      name: "Excel workbook",
      extensions: ["xlsx"],
    });
  });
});
