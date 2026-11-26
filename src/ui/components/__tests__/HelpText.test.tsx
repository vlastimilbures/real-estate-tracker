// @vitest-environment jsdom
//
// ADR 0214 (#391): an instruction sits in the panel body as a help line; the header
// keeps context only. ADR 0217: definitions go to an InfoTip instead.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Panel } from "../layout";
import { HelpText } from "../HelpText";

describe("Panel help (ADR 0214 §2)", () => {
  it("a help line leads the body, not the header", () => {
    const { container } = render(
      <Panel title="Leases" hint="nominal Kč" help={<HelpText>Why.</HelpText>}>
        <p>body</p>
      </Panel>,
    );
    const head = container.querySelector(".panel-head")!;
    expect(head.textContent).toBe("Leasesnominal Kč");
    const body = container.querySelector(".panel-body")!;
    expect(body.firstElementChild?.className).toBe("panel-help");
    expect(body.firstElementChild?.textContent).toBe("Why.");
  });

  it("has no disclosure variant: a longer text is an InfoTip (ADR 0217 §3)", () => {
    render(<HelpText>Why.</HelpText>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
