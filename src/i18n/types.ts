// The supported UI languages. English is the default; Czech and Russian are full
// translations. Number/date/currency formatting is not localized (always Czech-style).
export type Language = "en" | "cs" | "ru";

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "cs", label: "CS" },
  { value: "ru", label: "RU" },
];
