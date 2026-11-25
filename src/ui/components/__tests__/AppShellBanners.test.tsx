// @vitest-environment jsdom
//
// #350 (ADR 0194): the edit-error banner is read aloud only on the page where it first
// shows. Each page mounts its own shell; a later page shows the banner without a live
// role. A new edit error is announced. (The stale-data banner is gone: ADR 0228.)
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AppLayout } from "../AppLayout";
import { PageFrame } from "../PageFrame";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { getDict } from "../../../i18n";
import type { WriteError } from "../../../state/writeError";
import { describeWriteError } from "../../model/writeError";

const en = getDict("en");

/** A page change: the old page's shell goes, the new page mounts its own. */
function page(title: string) {
  return render(
    <AppLayout>
      <PageFrame title={title}>
        <p>{title}</p>
      </PageFrame>
    </AppLayout>,
  );
}

/** The live role of the banner showing `text`, or null. */
const role = (text: string) =>
  screen.getByText(text).closest(".error-banner")!.getAttribute("role");
const writeError = (message: string): WriteError => ({
  kind: "other",
  message,
});

describe("kept app banners announce once (#350)", () => {
  it("the edit-error banner is live on its first page only, and again for a new error", () => {
    const message = describeWriteError(en, writeError("disk full")).message;
    act(() => usePortfolioStore.setState({ error: writeError("disk full") }));
    const first = page("One");
    expect(role(message)).toBe("alert");
    first.unmount();

    const second = page("Two");
    expect(role(message)).toBeNull();

    act(() => usePortfolioStore.setState({ error: writeError("disk full") }));
    expect(role(message)).toBe("alert");
    second.unmount();

    page("Three");
    expect(role(message)).toBeNull();
  });
});
