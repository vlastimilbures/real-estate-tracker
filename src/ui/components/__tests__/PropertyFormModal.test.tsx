// @vitest-environment jsdom
//
// The property dialog (PropertyFormModal), add and edit: its required fields, a property's
// id, the optional Acquisition section, the edit form's wait for address and garage, where
// a refused save shows, and what a failed save keeps (the typed values, the focus). Each
// `describe` is one behaviour; the decision behind it is in the comment above it.
//
// The store's add and edit actions are spies, made new before every test; each describe
// puts the portfolio in the store with the actions and the address/garage read it needs.
// Class names are asserted only where the class is the contract: the required marker is
// a CSS class on the label (its "*" is generated content with no text), and
// `shownErrors` reads where each error sits.
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyFormModal } from "../PropertyFormModal";
import {
  usePortfolioStore,
  type MutationResult,
  type PropertyEdit,
  type PropertyExtras,
} from "../../../state/portfolioStore";
import type { WriteError } from "../../../state/writeError";
import { getDict } from "../../../i18n";
import { LANGUAGES } from "../../../i18n/types";
import {
  portfolio,
  assumptions,
  withPropertyId,
} from "../../../engine/__tests__/support/seed";
import {
  money,
  type EngineValidationError,
  type HoldingCost,
  type Portfolio,
  type Property,
} from "../../../engine";
import { success, writeFailure } from "../../../__tests__/support/result";
import { shownErrors } from "../../../__tests__/support/shownErrors";

const en = getDict("en");
const f = en.propertyForm;
const id = portfolio.properties[0]!.id;

type AddProperty = (
  p: PropertyEdit,
  cost: HoldingCost,
  extra: PropertyExtras,
) => Promise<MutationResult>;
type EditProperty = (
  p: PropertyEdit,
  extra: PropertyExtras,
) => Promise<MutationResult>;
type GetExtras = ReturnType<
  typeof usePortfolioStore.getState
>["getPropertyExtras"];
type Settle = {
  resolve: (e: PropertyExtras) => void;
  reject: (e: Error) => void;
};

const ok = (): Promise<MutationResult> => Promise.resolve({ ok: true });
const failure: MutationResult = {
  ok: false,
  error: { kind: "other", message: "Disk full" },
};

let addProperty: Mock<AddProperty>;
let editProperty: Mock<EditProperty>;
let onClose: Mock<() => void>;
/** Every address/garage read started, in order (the deferred read's describe). */
let reads: Settle[];
/** Settles the pending edit (the focus describe). */
let finish: (r: MutationResult) => void;

// The setup file (`src/__tests__/setup/stores.ts`) resets both stores before every test;
// this resets the spies and the module's variables, so no describe sees another's.
beforeEach(() => {
  addProperty = vi.fn<AddProperty>(ok);
  editProperty = vi.fn<EditProperty>(ok);
  onClose = vi.fn();
  reads = [];
  finish = () => undefined;
});

/** The sample portfolio, ready, with this test's actions and an address/garage read. */
function ready(
  getPropertyExtras: GetExtras = () =>
    Promise.resolve(success({ address: null, garage: null })),
) {
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
      addProperty,
      editProperty,
      getPropertyExtras,
    });
  });
}

const storedExtras: GetExtras = () =>
  Promise.resolve(success({ address: "Stored St 1", garage: null }));

const toggle = () => screen.getByRole("button", { name: f.acquisitionSection });
const saveChanges = () =>
  screen.getByRole("button", { name: en.common.saveChanges });
const nameField = () => screen.getByLabelText(f.name);
const addressField = () => screen.getByLabelText(f.address);

/** The text a control's aria-describedby points at: its error or its hint. */
const description = (control: HTMLElement) =>
  document.getElementById(control.getAttribute("aria-describedby") ?? "")
    ?.textContent;

async function fillRequired(name = "Byt Nový") {
  await userEvent.type(screen.getByLabelText(f.name), name);
  await userEvent.type(screen.getByLabelText(f.purchaseDate), "01.03.2021");
  await userEvent.type(screen.getByLabelText(f.purchasePrice), "5200000");
}

/** Opens the edit form on the first property and waits for its stored address. */
async function openStored(close: () => void = () => {}) {
  render(<PropertyFormModal mode="edit" propertyId={id} onClose={close} />);
  await screen.findByDisplayValue("Stored St 1");
}

// ADR 0077: the dialog marks its required fields through Field `required` (CSS marker +
// aria-required), like the record forms; no "*" in the strings. The stores stay initial.
describe("required fields", () => {
  it("marks name, purchase date and purchase price required", () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    for (const label of [f.name, f.purchaseDate, f.purchasePrice]) {
      const control = screen.getByLabelText(label);
      expect(control.getAttribute("aria-required"), label).toBe("true");
      // The class draws the "*": it is the contract, with no role or name.
      const fieldLabel = control.closest(".field")?.querySelector("label");
      expect(fieldLabel?.className, label).toContain("required");
    }
  });

  it("leaves optional fields unmarked", () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    expect(addressField().getAttribute("aria-required")).toBeNull();
  });

  it.each(LANGUAGES.map((l) => l.value))(
    "has no '*' in the %s labels",
    (lang) => {
      const strings = Object.values(getDict(lang).propertyForm).filter(
        (v): v is string => typeof v === "string",
      );
      expect(strings.filter((s) => s.includes("*"))).toEqual([]);
    },
  );
});

// ADR 0127: a new property's id is random, never made from its name. A name without Latin
// letters used to get the id "", and "Dubová" got the sample's id `dubova`.
describe("a new property's id", () => {
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  beforeEach(() => ready());

  async function add(name: string) {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await fillRequired(name);
    await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
  }

  it.each(["Квартира на Тверской", "Dubová"])(
    "is random, not made from the name %s",
    async (name) => {
      await add(name);
      const [property, cost] = addProperty.mock.calls[0]!;
      expect(property.name).toBe(name);
      expect(property.id).toMatch(UUID);
      expect(cost).toEqual({
        id: `hc-${property.id}`,
        propertyId: property.id,
      });
    },
  );

  it("stays the same when a failed save is retried", async () => {
    addProperty.mockResolvedValueOnce({
      ok: false,
      error: { kind: "other", message: "disk busy" },
    });
    await add("Byt Nový");
    await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
    expect(addProperty).toHaveBeenCalledTimes(2);
    expect(addProperty.mock.calls[1]![0].id).toBe(
      addProperty.mock.calls[0]![0].id,
    );
  });
});

// ADR 0127: an edit saves under the stored id, whatever it is.
describe("an edited property's id", () => {
  beforeEach(() => ready());

  it('saves a property stored with the id "" under that id', async () => {
    const own = portfolio.properties[0]!;
    act(() =>
      usePortfolioStore.setState({ portfolio: withPropertyId(own.id, "") }),
    );
    render(
      <PropertyFormModal mode="edit" propertyId="" onClose={() => undefined} />,
    );
    await screen.findByDisplayValue(own.name);
    await userEvent.click(saveChanges());
    expect(editProperty).toHaveBeenCalledTimes(1);
    expect(editProperty.mock.calls[0]![0]).toMatchObject({
      id: "",
      name: own.name,
    });
  });
});

// ADR 0119 §8–§9: the optional Acquisition section. It is the only place that clears a
// funding amount or sets the note, so a save always sends the record the form shows; an
// empty one clears the stored record.
describe("the Acquisition section", () => {
  beforeEach(() => ready());

  function withFunding(pid: string, funding: Property["funding"]): Portfolio {
    return {
      ...portfolio,
      properties: portfolio.properties.map((p) =>
        p.id === pid ? { ...p, funding } : p,
      ),
    };
  }

  const storeLipovaFunding = () =>
    act(() =>
      usePortfolioStore.setState({
        portfolio: withFunding("lipova", {
          ownCash: money("1500000"),
          note: "Deposit",
        }),
      }),
    );

  /** The funding record of the first call's Property, amounts as strings. */
  function savedFunding(fn: typeof addProperty) {
    const funding = fn.mock.calls[0]![0].funding;
    return (
      funding &&
      Object.fromEntries(
        Object.entries(funding).map(([k, v]) => [k, String(v)]),
      )
    );
  }

  it("add: starts shut; its toggle controls a body that is on the page", () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    const body = document.getElementById(
      toggle().getAttribute("aria-controls")!,
    );
    expect(body).not.toBeNull();
    expect(screen.queryByLabelText(f.ownCash)).toBeNull();
  });

  it("opens to own cash, transaction costs, initial works and a note, none required", async () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await userEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    for (const label of [
      f.ownCash,
      f.transactionCosts,
      f.initialWorks,
      f.fundingNote,
    ]) {
      const control = screen.getByLabelText(label);
      expect(control.getAttribute("aria-required"), label).toBeNull();
    }
    expect(screen.getByLabelText(f.ownCash).getAttribute("placeholder")).toBe(
      f.unknownPlaceholder,
    );
  });

  it("add: saves the entered record with the property", async () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await fillRequired();
    await userEvent.click(toggle());
    await userEvent.type(screen.getByLabelText(f.ownCash), "1 500 000");
    await userEvent.type(screen.getByLabelText(f.fundingNote), " Deposit ");
    await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
    await waitFor(() => expect(addProperty).toHaveBeenCalledOnce());
    expect(savedFunding(addProperty)).toEqual({
      ownCash: "1500000",
      note: "Deposit",
    });
  });

  it("add: a section left blank saves an empty record", async () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await fillRequired();
    await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
    await waitFor(() => expect(addProperty).toHaveBeenCalledOnce());
    expect(addProperty.mock.calls[0]![0].funding).toStrictEqual({});
  });

  it("edit: opens with the stored record drafted", async () => {
    storeLipovaFunding();
    render(
      <PropertyFormModal
        mode="edit"
        propertyId="lipova"
        onClose={() => undefined}
      />,
    );
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText<HTMLInputElement>(f.ownCash).value).toBe(
      "1500000",
    );
    expect(
      screen.getByLabelText<HTMLInputElement>(f.transactionCosts).value,
    ).toBe("");
    expect(
      screen.getByLabelText<HTMLTextAreaElement>(f.fundingNote).value,
    ).toBe("Deposit");
  });

  it("edit: a stored record drafted on open is not an unsaved change: Esc still closes", async () => {
    storeLipovaFunding();
    const close = vi.fn();
    render(
      <PropertyFormModal mode="edit" propertyId="lipova" onClose={close} />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>(f.ownCash).value).toBe(
        "1500000",
      ),
    );
    await userEvent.keyboard("{Escape}");
    expect(close).toHaveBeenCalledOnce();
  });

  it("edit: stays shut when nothing is recorded", () => {
    render(
      <PropertyFormModal
        mode="edit"
        propertyId="dubova"
        onClose={() => undefined}
      />,
    );
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("edit: opens with nothing recorded when asked (a Data check link, ADR 0118), at own cash; Esc still closes", async () => {
    const close = vi.fn();
    render(
      <PropertyFormModal
        mode="edit"
        propertyId="dubova"
        openFunding
        onClose={close}
      />,
    );
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText<HTMLInputElement>(f.ownCash).value).toBe("");
    expect(document.activeElement).toBe(screen.getByLabelText(f.ownCash));
    await userEvent.keyboard("{Escape}");
    expect(close).toHaveBeenCalledOnce();
  });

  it("edit: clearing every field saves an empty record, which clears the stored one", async () => {
    storeLipovaFunding();
    render(
      <PropertyFormModal
        mode="edit"
        propertyId="lipova"
        onClose={() => undefined}
      />,
    );
    await userEvent.clear(screen.getByLabelText(f.ownCash));
    await userEvent.clear(screen.getByLabelText(f.fundingNote));
    await userEvent.click(saveChanges());
    await waitFor(() => expect(editProperty).toHaveBeenCalledOnce());
    expect(editProperty.mock.calls[0]![0].funding).toStrictEqual({});
  });

  it("shutting the section keeps the entered values, and they are saved", async () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await fillRequired();
    await userEvent.click(toggle());
    await userEvent.type(screen.getByLabelText(f.initialWorks), "0");
    await userEvent.click(toggle());
    expect(screen.queryByLabelText(f.initialWorks)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
    await waitFor(() => expect(addProperty).toHaveBeenCalledOnce());
    expect(savedFunding(addProperty)).toEqual({ initialWorks: "0" });
  });

  it("an invalid amount in the shut section opens it and marks the field", async () => {
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await fillRequired();
    await userEvent.click(toggle());
    await userEvent.type(screen.getByLabelText(f.transactionCosts), "abc");
    await userEvent.click(toggle());
    await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const control = screen.getByLabelText(f.transactionCosts);
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(description(control)).toContain(en.forms.invalidHint.money);
    expect(addProperty).not.toHaveBeenCalled();
  });

  // The form refuses a negative amount itself (ADR 0140); a stubbed engine rule stands in
  // for any refusal that reaches the store.
  it("an amount the engine refuses shows on its field and opens the section", async () => {
    editProperty.mockResolvedValue({
      ok: false,
      error: {
        kind: "input",
        errors: [
          {
            code: "NEGATIVE_AMOUNT",
            entity: "property",
            id: "dubova",
            field: "ownCash",
          },
        ],
      },
    });
    render(
      <PropertyFormModal
        mode="edit"
        propertyId="dubova"
        onClose={() => undefined}
      />,
    );
    await userEvent.click(toggle());
    await userEvent.type(screen.getByLabelText(f.ownCash), "5");
    await userEvent.click(toggle());
    await userEvent.click(saveChanges());
    await waitFor(() =>
      expect(toggle().getAttribute("aria-expanded")).toBe("true"),
    );
    expect(description(screen.getByLabelText(f.ownCash))).toContain(
      en.inputRules.NEGATIVE_AMOUNT,
    );
  });

  it("opening or shutting the section is not an unsaved change: Esc still closes", async () => {
    const close = vi.fn();
    render(<PropertyFormModal mode="add" onClose={close} />);
    await userEvent.click(toggle());
    await userEvent.keyboard("{Escape}");
    expect(close).toHaveBeenCalledOnce();
  });
});

// ADR 0184 §3: the edit form reads address and garage separately. Save waits for that
// read, and stays disabled with an error when it fails, so it can never write them NULL.
describe("waiting for address and garage", () => {
  /** The latest read started. */
  const settle = () => reads[reads.length - 1]!;

  beforeEach(() =>
    ready(() =>
      new Promise<PropertyExtras>((resolve, reject) => {
        reads.push({ resolve, reject });
      }).then(success, writeFailure),
    ),
  );

  it("keeps Save disabled until they load, then fills them", async () => {
    render(
      <PropertyFormModal mode="edit" propertyId={id} onClose={() => {}} />,
    );
    expect(saveChanges()).toHaveProperty("disabled", true);
    // Enter in a field submits the form too; it must not save either.
    await userEvent.type(nameField(), "{Enter}");
    expect(editProperty).not.toHaveBeenCalled();

    await act(async () =>
      settle().resolve({ address: "Main St 1", garage: true }),
    );
    expect(saveChanges()).toHaveProperty("disabled", false);
    expect(addressField()).toHaveProperty("value", "Main St 1");
    await userEvent.click(saveChanges());
    expect(editProperty).toHaveBeenCalledWith(expect.anything(), {
      address: "Main St 1",
      garage: true,
    });
  });

  it("shows an error and keeps Save disabled when they fail to load", async () => {
    render(
      <PropertyFormModal mode="edit" propertyId={id} onClose={() => {}} />,
    );
    await act(async () => settle().reject(new Error("disk")));
    expect(screen.getByText(f.errExtrasLoad)).toBeTruthy();
    expect(saveChanges()).toHaveProperty("disabled", true);
    await userEvent.type(nameField(), "{Enter}");
    expect(editProperty).not.toHaveBeenCalled();
  });

  it("ignores a stale read that fails after a newer one loaded", async () => {
    render(
      <PropertyFormModal mode="edit" propertyId={id} onClose={() => {}} />,
    );
    // A reload while the form is open starts no read (ADR 0241 §1).
    act(() => usePortfolioStore.setState({ portfolio: { ...portfolio } }));
    expect(reads).toHaveLength(1);
    // A new read function starts a second read.
    const stub = usePortfolioStore.getState().getPropertyExtras;
    act(() =>
      usePortfolioStore.setState({
        getPropertyExtras: (propertyId) => stub(propertyId),
      }),
    );
    expect(reads).toHaveLength(2);
    const [first, second] = reads;
    await act(async () => second!.resolve({ address: "A", garage: null }));
    await act(async () => first!.reject(new Error("late")));
    expect(screen.queryByText(f.errExtrasLoad)).toBeNull();
    expect(saveChanges()).toHaveProperty("disabled", false);
  });

  it("does not wait in the add form", () => {
    render(<PropertyFormModal mode="add" onClose={() => {}} />);
    expect(screen.getByRole("button", { name: f.addTitle })).toHaveProperty(
      "disabled",
      false,
    );
  });
});

// ADR 0261 (#490 PR 3): where the dialog shows a refused save, pinned before its keys
// became camelCase (#440). A failure naming one of the form's fields shows on that field,
// a funding field's also opens the Acquisition section (ADR 0119 §9), and anything else
// shows above the buttons. A rule on the funding note shows nowhere today: the note's
// field takes no error (pinned as it is).
describe("where a refused save shows", () => {
  const rule = en.inputRules.NEGATIVE_AMOUNT;

  beforeEach(() => ready());

  const onField = (field?: string): WriteError => ({
    kind: "input",
    errors: [
      {
        code: "NEGATIVE_AMOUNT",
        entity: "property",
        id: "p",
        // Any name, the engine's or not, to pin where each one goes.
        ...(field !== undefined && {
          field: field as EngineValidationError["field"],
        }),
      },
    ],
  });

  /** Add a valid property that the store refuses with `error`: the errors shown, and
   *  whether the Acquisition section is open. */
  async function refused(error: WriteError) {
    addProperty.mockResolvedValue({ ok: false, error });
    render(<PropertyFormModal mode="add" onClose={() => undefined} />);
    await fillRequired();
    await userEvent.click(screen.getByRole("button", { name: f.addTitle }));
    await waitFor(() => expect(addProperty).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: f.addTitle })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    const open = toggle().getAttribute("aria-expanded");
    return { shown: shownErrors(), open };
  }

  it.each([
    ["name", f.name],
    ["address", f.address],
    ["type", f.type],
    ["sizeM2", f.size],
    ["garage", f.garage],
    ["purchaseDate", f.purchaseDate],
    ["purchasePrice", f.purchasePrice],
    ["appreciationOverridePa", f.appreciationOverride],
    ["rentIndexOverridePa", f.rentIndexOverride],
  ])("a rule on %s shows on its field", async (field, label) => {
    expect(await refused(onField(field))).toEqual({
      shown: { [label]: rule },
      open: "false",
    });
  });

  it.each([
    ["ownCash", f.ownCash],
    ["transactionCosts", f.transactionCosts],
    ["initialWorks", f.initialWorks],
  ])(
    "a rule on %s shows on its field and opens the section",
    async (field, label) => {
      expect(await refused(onField(field))).toEqual({
        shown: { [label]: rule },
        open: "true",
      });
    },
  );

  it("a rule on the funding note shows nowhere", async () => {
    expect(await refused(onField("fundingNote"))).toEqual({
      shown: {},
      open: "false",
    });
  });

  it.each([
    ["note"],
    ["funding_note"],
    ["purchase_price"],
    ["id"],
    [undefined],
  ])("a rule on %s shows above the buttons", async (field) => {
    expect(await refused(onField(field))).toEqual({
      shown: { form: rule },
      open: "false",
    });
  });

  it("a CHECK on a funding amount shows on it and opens the section", async () => {
    expect(
      await refused({
        kind: "constraint",
        constraint: { kind: "check", check: "property_own_cash_not_negative" },
      }),
    ).toEqual({
      shown: { [f.ownCash]: en.inputRules.NEGATIVE_AMOUNT },
      open: "true",
    });
  });

  it("a duplicate name shows on the name field", async () => {
    expect(
      await refused({
        kind: "constraint",
        constraint: { kind: "unique", table: "properties", columns: ["name"] },
      }),
    ).toEqual({
      shown: { [f.name]: en.writeErrors.duplicatePropertyName },
      open: "false",
    });
  });

  it("any other failure shows above the buttons", async () => {
    expect(await refused({ kind: "other", message: "disk is full" })).toEqual({
      shown: { form: "disk is full" },
      open: "false",
    });
  });

  it("two rules on one field show the first, each field its own", async () => {
    const error: WriteError = {
      kind: "input",
      errors: [
        {
          code: "NEGATIVE_AMOUNT",
          entity: "property",
          id: "p",
          field: "purchasePrice",
        },
        {
          code: "ORPHAN_ROW",
          entity: "property",
          id: "p",
          field: "purchasePrice",
        },
        {
          code: "ORPHAN_ROW",
          entity: "property",
          id: "p",
          field: "purchaseDate",
        },
      ],
    };
    expect(await refused(error)).toEqual({
      shown: {
        [f.purchasePrice]: rule,
        [f.purchaseDate]: en.inputRules.ORPHAN_ROW,
      },
      open: "false",
    });
  });
});

// ADR 0241 (#438): the edit form takes the stored values once. A failed write reloads the
// store; that used to put the stored values back into the fields, so the typed edits were
// gone and Esc closed the dialog. A thrown save showed nothing.
describe("a failed save keeps the typed values", () => {
  beforeEach(() => ready(storedExtras));

  async function openAndType() {
    await openStored(onClose);
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), "Byt Typed");
    await userEvent.clear(addressField());
    await userEvent.type(addressField(), "Typed St 9");
  }

  it("keeps them, shows the error and stays unsaved after a write that reloads", async () => {
    // The store reloads after a failed write: a new portfolio object (#438).
    editProperty.mockImplementation(() => {
      usePortfolioStore.setState({ portfolio: { ...portfolio } });
      return Promise.resolve({
        ok: false,
        error: { kind: "other", message: "disk busy" },
      });
    });
    await openAndType();
    await userEvent.click(saveChanges());
    expect(editProperty).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(nameField()).toHaveProperty("value", "Byt Typed");
    expect(addressField()).toHaveProperty("value", "Typed St 9");
    // Still unsaved, so Esc does not close the dialog (UX-029).
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a thrown save and keeps the typed name", async () => {
    editProperty.mockResolvedValue({
      ok: false,
      error: { kind: "other", message: "disk gone" },
    });
    await openAndType();
    await userEvent.click(saveChanges());
    expect(editProperty).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(nameField()).toHaveProperty("value", "Byt Typed");
    expect(saveChanges()).toHaveProperty("disabled", false);
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ADR 0246 (#538): Save changes disables while the save runs, which drops its focus to
// <body>. After a failed save the form puts focus back on it, unless the user moved it.
describe("focus after a failed save", () => {
  const saveOrSaving = () =>
    screen.getByRole("button", {
      name: new RegExp(`^(${en.common.saveChanges}|${en.common.saving})$`),
    });

  beforeEach(() => {
    editProperty.mockImplementation(
      () => new Promise<MutationResult>((resolve) => (finish = resolve)),
    );
    ready(storedExtras);
  });

  it("puts focus back on Save changes after the fixup dropped it to <body>", async () => {
    await openStored();
    await userEvent.click(saveOrSaving());
    expect(saveOrSaving()).toHaveProperty("disabled", true);
    // The focus fixup for the disabled button, fired now rather than on jsdom's timer.
    act(() => saveOrSaving().blur());
    expect(document.activeElement).toBe(document.body);
    await act(async () => finish(failure));
    expect(screen.getByRole("alert").textContent).toContain("Disk full");
    expect(document.activeElement).toBe(saveOrSaving());
  });

  it("leaves focus where the user moved it during the save", async () => {
    await openStored();
    await userEvent.click(saveOrSaving());
    const name = nameField();
    act(() => name.focus());
    await act(async () => finish(failure));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.activeElement).toBe(name);
  });
});
