// The calendar inside DateInput's popover. DateInput loads this file on the first open, so
// react-day-picker and its date-fns locales stay out of the startup bundle (DR-009).
import { DayPicker } from "react-day-picker";
import { cs, enGB, ru } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { useT } from "../hooks/useT";
import { useUiStore } from "../../state/uiStore";
import type { Language } from "../../i18n/types";
import { at } from "../../lib/arrays";

// The calendar's built-in screen-reader labels (month navigation, weekday and day names)
// follow the UI language (UX-034); the visible caption/weekday text uses our dictionary.
const DAY_PICKER_LOCALE: Record<Language, typeof enGB> = { en: enGB, cs, ru };

/** Single-day calendar. All dates are LOCAL midnight dates (see DateInput). */
export function DateCalendar({
  selected,
  first,
  last,
  onSelect,
}: {
  selected: Date | undefined;
  /** First and last selectable day. */
  first: Date | undefined;
  last: Date | undefined;
  onSelect: (day: Date | undefined) => void;
}) {
  const t = useT();
  const language = useUiStore((s) => s.language);
  return (
    <DayPicker
      mode="single"
      locale={DAY_PICKER_LOCALE[language]}
      {...(selected && { selected, defaultMonth: selected })}
      {...(first && { startMonth: first })}
      {...(last && { endMonth: last })}
      disabled={[
        ...(first ? [{ before: first }] : []),
        ...(last ? [{ after: last }] : []),
      ]}
      onSelect={onSelect}
      weekStartsOn={t.calendar.weekStartsOn as 0 | 1}
      formatters={{
        formatCaption: (month) =>
          `${t.monthsShort[month.getMonth()]} ${month.getFullYear()}`,
        formatWeekdayName: (weekday) =>
          at(t.calendar.weekdaysShort, weekday.getDay()),
      }}
    />
  );
}
