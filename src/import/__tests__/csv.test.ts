// The pure CSV parser (src/import/csv.ts) on awkward-but-realistic files: strict
// reading per D-49 / D-53 (P5b; these replace the P3 characterisations of DR-027,
// DR-035, DR-036, DR-039 and DR-109). Happy paths and templates live in import.test.ts.
import { describe, it, expect } from "vitest";
import {
  parseProperties,
  parseValuations,
  parseRents,
  parseMortgages,
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
} from "../csv";

const H =
  "name,address,type,size_m2,garage,purchase_date,purchase_price,appreciation_override_pa,rent_index_override_pa";
const MH =
  "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years";
const names = (r: { rows: { name: string }[] }) => r.rows.map((x) => x.name);

describe("encoding and quoting", () => {
  it("strips a UTF-8 BOM before the header", () => {
    const r = parseProperties(`\uFEFF${H}\nA,,,,,2020-01-01,100,,`);
    expect(r.errors).toEqual([]);
    expect(names(r)).toEqual(["A"]);
  });

  it("honours quoted fields with commas and doubled quotes", () => {
    const r = parseProperties(
      `${H}\n"Byt ""Nový"", 2+kk","Ulice 1, Praha",,,,2020-01-01,"1000000",,`,
    );
    expect(r.errors).toEqual([]);
    expect(r.rows[0].name).toBe('Byt "Nový", 2+kk');
    expect(r.rows[0].address).toBe("Ulice 1, Praha");
  });

  it("accepts CRLF line endings and trims header whitespace", () => {
    expect(
      names(parseProperties(`${H}\r\nA,,,,,2020-01-01,100,,\r\n`)),
    ).toEqual(["A"]);
    expect(
      names(
        parseProperties(
          " name , purchase_date ,purchase_price\nA,2020-01-01,100",
        ),
      ),
    ).toEqual(["A"]);
  });

  it("an empty file or a header-only file yields no rows and no errors", () => {
    expect(parseProperties("")).toEqual({ rows: [], errors: [] });
    expect(parseProperties(H)).toEqual({ rows: [], errors: [] });
  });
});

describe("blank lines and ragged rows", () => {
  it("skips blank and whitespace-only lines; rows are physical file lines (DR-109)", () => {
    const r = parseProperties(
      `${H}\n\nA,,,,,2020-01-01,100,,\n   \n\nB,,,,,2020-01-02,x,,\n`,
    );
    expect(names(r)).toEqual(["A"]);
    expect(r.rows[0].line).toBe(3);
    expect(r.errors).toEqual([
      {
        row: 6,
        field: "purchase_price",
        error: { code: "invalidNumber", value: "x" },
      },
    ]);
  });

  it("counts lines inside a quoted multi-line cell", () => {
    const r = parseProperties(
      `${H}\n"A\nB",,,,,2020-01-01,100,,\nC,,,,,bad,1,,`,
    );
    expect(r.rows[0]).toMatchObject({ name: "A\nB", line: 2 });
    expect(r.errors[0].row).toBe(4);
  });

  it("a short or long row is a malformed row (DR-036)", () => {
    const short = parseProperties(`${H}\nA,,,,,2020-01-01`);
    const long = parseProperties(`${H}\nA,,,,,2020-01-01,100,,,EXTRA,MORE`);
    expect(short.rows).toEqual([]);
    expect(short.errors).toEqual([
      {
        row: 2,
        field: "",
        error: { code: "malformedRow", expected: 9, found: 6 },
      },
    ]);
    expect(long.rows).toEqual([]);
    expect(long.errors[0].error).toEqual({
      code: "malformedRow",
      expected: 9,
      found: 11,
    });
  });

  it("an unterminated quote is reported, not guessed", () => {
    const r = parseProperties(`${H}\n"A,,,,,2020-01-01,100,,`);
    expect(r.rows).toEqual([]);
    expect(r.errors).toEqual([
      { row: 2, field: "", error: { code: "badQuotes" } },
    ]);
  });
});

describe("Czech-Excel files (D-49)", () => {
  const enc = (s: string) => new TextEncoder().encode(s);

  it("rejects a ';' delimiter on the header line", () => {
    const r = parseProperties(
      `${H.replaceAll(",", ";")}\nA;;;;;2020-01-01;100;;`,
    );
    expect(r).toEqual({
      rows: [],
      errors: [{ row: 1, field: "", error: { code: "semicolonDelimiter" } }],
    });
  });

  it("names a decimal comma with its row and column", () => {
    const r = parseProperties(`${H}\nA,,,,,2020-01-01,"4 800 000,50",,`);
    expect(r.rows).toEqual([]);
    expect(r.errors).toEqual([
      {
        row: 2,
        field: "purchase_price",
        error: { code: "decimalComma", value: "4 800 000,50" },
      },
    ]);
    const rate = parseMortgages(`${MH}\nA,2025-01-01,100000,5,"0,0169",1000,`);
    expect(rate.errors[0]).toEqual({
      row: 2,
      field: "interest_rate_pa",
      error: { code: "decimalComma", value: "0,0169" },
    });
  });

  it("rejects Windows-1250 bytes, naming the first bad cell", () => {
    // "Byt Žižkov" in CP1250: Ž = 0x8E, ž = 0x9E — not valid UTF-8.
    const head = enc(`${H}\nA,,,,,2020-01-01,100,,\nByt `);
    const tail = enc("kov,,,,,2020-01-01,100,,\n");
    const bytes = new Uint8Array([...head, 0x8e, 0x69, 0x9e, ...tail]);
    expect(parseProperties(bytes)).toEqual({
      rows: [],
      errors: [{ row: 3, field: "name", error: { code: "notUtf8" } }],
    });
  });

  it("reads UTF-8 bytes with or without a BOM", () => {
    const body = `${H}\nŽižkov,,,,,2020-01-01,100,,`;
    for (const bytes of [
      enc(body),
      new Uint8Array([0xef, 0xbb, 0xbf, ...enc(body)]),
    ]) {
      const r = parseProperties(bytes);
      expect(r.errors).toEqual([]);
      expect(names(r)).toEqual(["Žižkov"]);
    }
  });
});

describe("limits (D-53)", () => {
  it("refuses a file over 2 MB before reading any row", () => {
    const big = `${H}\n${"x".repeat(CSV_MAX_BYTES)}`;
    expect(parseProperties(big).errors).toEqual([
      {
        row: 0,
        field: "",
        error: { code: "fileTooLarge", limitBytes: CSV_MAX_BYTES },
      },
    ]);
  });

  it("accepts 5,000 data rows and refuses 5,001", () => {
    const file = (n: number) =>
      [
        "property_name,valid_from,valid_to,market_value",
        ...Array.from(
          { length: n },
          (_, i) => `A,${2000 + Math.floor(i / 365)}-01-01,,${i}`,
        ),
      ].join("\n");
    expect(
      parseValuations(file(CSV_MAX_ROWS)).errors.some(
        (e) => e.error.code === "tooManyRows",
      ),
    ).toBe(false);
    expect(parseValuations(file(CSV_MAX_ROWS + 1)).errors).toEqual([
      {
        row: 0,
        field: "",
        error: { code: "tooManyRows", limit: CSV_MAX_ROWS },
      },
    ]);
  });
});

describe("number formats", () => {
  it("rejects a percent-formatted rate", () => {
    const r = parseMortgages(`${MH}\nA,2025-01-01,100000,5,4.5%,1000,`);
    expect(r.errors[0]).toEqual({
      row: 2,
      field: "interest_rate_pa",
      error: { code: "invalidNumber", value: "4.5%" },
    });
  });

  it("rejects a rate written as a percentage number", () => {
    const r = parseMortgages(`${MH}\nA,2025-01-01,100000,5,1.69,1000,`);
    expect(r.errors).toEqual([
      {
        row: 2,
        field: "interest_rate_pa",
        error: { code: "rateOutOfRange", value: "1.69" },
      },
    ]);
  });

  it("rejects negative money, exponents, hex and Infinity (DR-036)", () => {
    for (const v of ["-100", "1e3", "0x10", "Infinity", "+5", "1 000"]) {
      const r = parseProperties(`${H}\nA,,,,,2020-01-01,${v},,`);
      expect(r.rows, v).toEqual([]);
      expect(r.errors[0].field).toBe("purchase_price");
    }
    expect(
      parseProperties(`${H}\nA,,,,,2020-01-01,-100,,`).errors[0].error,
    ).toEqual({ code: "negativeAmount", value: "-100" });
  });

  it("keeps a signed growth override", () => {
    const r = parseProperties(`${H}\nA,,,,,2020-01-01,100,-0.01,`);
    expect(r.errors).toEqual([]);
    expect(r.rows[0].appreciation_override_pa).toBe("-0.01");
  });

  it("integers are plain unsigned digits (DR-027)", () => {
    for (const v of ["52.6", "-3", "1e2", "0x10", "Infinity"]) {
      const r = parseProperties(`${H}\nA,,,${v},,2020-01-01,100,,`);
      expect(r.errors, v).toEqual([
        {
          row: 2,
          field: "size_m2",
          error: { code: "invalidInteger", value: v },
        },
      ]);
    }
  });

  it("a loan term must be at least one year (DR-027)", () => {
    const r = parseMortgages(`${MH}\nA,2025-01-01,100000,5,0.03,,0`);
    expect(r.errors).toEqual([
      {
        row: 2,
        field: "loan_term_years",
        error: { code: "notPositive", value: "0" },
      },
      {
        row: 2,
        field: "monthly_instalment",
        error: { code: "instalmentRequired" },
      },
    ]);
  });

  // ADR 0076 (DR-177, UX-069): the form bounds of ADR 0075 apply to CSV too.
  it("bounds fixation 0–50, loan term 1–50 and size 1–10 000", () => {
    const mortgage = (fix: string, term: string) =>
      parseMortgages(`${MH}\nA,2025-01-01,100000,${fix},0.03,2000,${term}`);
    const property = (size: string) =>
      parseProperties(`${H}\nA,,,${size},,2020-01-01,100,,`);
    const out = (field: string, value: string, min: number, max: number) => [
      { row: 2, field, error: { code: "outOfRange", value, min, max } },
    ];

    for (const [fix, term] of [
      ["0", "1"],
      ["50", "50"],
    ])
      expect(mortgage(fix, term).errors, `${fix}/${term}`).toEqual([]);
    expect(mortgage("51", "30").errors).toEqual(
      out("fixation_years", "51", 0, 50),
    );
    expect(mortgage("5", "51").errors).toEqual(
      out("loan_term_years", "51", 1, 50),
    );

    for (const size of ["1", "10000", ""])
      expect(property(size).errors, size).toEqual([]);
    expect(property("0").errors).toEqual(out("size_m2", "0", 1, 10_000));
    expect(property("10001").errors).toEqual(
      out("size_m2", "10001", 1, 10_000),
    );
  });
});

describe("funding amounts (ADR 0119 §8)", () => {
  const FH = `${H},own_cash,transaction_costs,initial_works`;

  it("reads own cash, transaction costs and initial works; 0 is a value", () => {
    const r = parseProperties(`${FH}\nA,,,,,2020-01-01,100,,,850000,60000.5,0`);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({
      own_cash: "850000",
      transaction_costs: "60000.5",
      initial_works: "0",
    });
  });

  it("a blank cell or a missing column is unknown (null)", () => {
    const blank = parseProperties(`${FH}\nA,,,,,2020-01-01,100,,,,,`);
    const missing = parseProperties(`${H}\nA,,,,,2020-01-01,100,,`);
    for (const r of [blank, missing]) {
      expect(r.errors).toEqual([]);
      expect(r.rows[0]).toMatchObject({
        own_cash: null,
        transaction_costs: null,
        initial_works: null,
      });
    }
  });

  it("refuses a negative amount on its own column and line", () => {
    const cells = ["-1,,", ",-1,", ",,-1"];
    const fields = ["own_cash", "transaction_costs", "initial_works"];
    cells.forEach((c, i) => {
      const r = parseProperties(`${FH}\nA,,,,,2020-01-01,100,,,${c}`);
      expect(r.rows).toEqual([]);
      expect(r.errors).toEqual([
        {
          row: 2,
          field: fields[i],
          error: { code: "negativeAmount", value: "-1" },
        },
      ]);
    });
  });

  it("names the fix for a decimal comma, like purchase_price (D-49)", () => {
    const r = parseProperties(`${FH}\nA,,,,,2020-01-01,100,,,"850 000,5",,`);
    expect(r.errors).toEqual([
      {
        row: 2,
        field: "own_cash",
        error: { code: "decimalComma", value: "850 000,5" },
      },
    ]);
  });
});

describe("dates", () => {
  it("rejects a non-ISO date format", () => {
    const r = parseProperties(`${H}\nA,,,,,01.02.2020,100,,`);
    expect(r.errors).toEqual([
      {
        row: 2,
        field: "purchase_date",
        error: { code: "invalidDate", value: "01.02.2020" },
      },
    ]);
  });

  it("rejects an impossible calendar date (DR-035)", () => {
    for (const v of ["2020-13-45", "2026-02-31"]) {
      const r = parseProperties(`${H}\nA,,,,,${v},100,,`);
      expect(r.rows).toEqual([]);
      expect(r.errors).toEqual([
        {
          row: 2,
          field: "purchase_date",
          error: { code: "impossibleDate", value: v },
        },
      ]);
    }
  });

  it("reads an optional contract maturity date (DR-129)", () => {
    const head = `${MH},contract_maturity_date`;
    const r = parseMortgages(
      `${head}\nA,2025-01-01,100000,5,0.03,1000,,2050-01-01\nB,2025-01-01,100000,5,0.03,1000,,`,
    );
    expect(r.errors).toEqual([]);
    expect(r.rows.map((m) => m.contract_maturity_date)).toEqual([
      "2050-01-01",
      null,
    ]);
  });
});

describe("foreign keys and duplicates", () => {
  const known = new Set(["A"]);

  it("flags an unknown property_name in rents and mortgages", () => {
    const rent = parseRents(
      "property_name,start_date,end_date,monthly_rent\nNope,2025-01-01,,1000",
      known,
    );
    const mort = parseMortgages(
      `${MH}\nNope,2025-01-01,100000,5,0.03,1000,`,
      known,
    );
    for (const r of [rent, mort]) {
      expect(r.rows).toEqual([]);
      expect(r.errors).toEqual([
        {
          row: 2,
          field: "property_name",
          error: { code: "unknownProperty", value: "Nope" },
        },
      ]);
    }
  });

  it("matches property names trimmed and case-insensitively (D-55)", () => {
    const r = parseRents(
      "property_name,start_date,end_date,monthly_rent\n a ,2025-01-01,,1000",
      known,
    );
    expect(r.errors).toEqual([]);
  });

  it("a repeated natural key in one file is a fatal duplicate (D-55)", () => {
    const props = parseProperties(
      `${H}\nA,,,,,2020-01-01,100,,\n a ,,,,,2021-01-01,200,,`,
    );
    expect(names(props)).toEqual(["A"]);
    expect(props.errors).toEqual([
      { row: 3, field: "name", error: { code: "duplicateKey", firstRow: 2 } },
    ]);
    const vals = parseValuations(
      "property_name,valid_from,valid_to,market_value\nA,2025-01-01,,1\na,2025-01-01,,2",
      known,
    );
    expect(vals.errors).toEqual([
      {
        row: 3,
        field: "valid_from",
        error: { code: "duplicateKey", firstRow: 2 },
      },
    ]);
  });
});
