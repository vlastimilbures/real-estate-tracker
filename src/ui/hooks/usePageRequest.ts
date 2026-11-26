// The one-off request this visit's navigation brought a page (ADR 0269): ⌘N's Add form,
// a Guide term, a Property detail target. It lives only for the visit; the page acts on
// each request once, by its id, and never clears it.
import { useState } from "react";
import { useUiStore, type RouteRequest } from "../../state/uiStore";

type RequestFor<P extends RouteRequest["page"]> = Extract<
  RouteRequest,
  { page: P }
>;

/** The request for `page`, or null. */
export function usePageRequest<P extends RouteRequest["page"]>(
  page: P,
): RequestFor<P> | null {
  return useUiStore((s) =>
    s.request?.page === page ? (s.request as RequestFor<P>) : null,
  );
}

/** Whether the request with `id` still waits for this page, and `handled` to mark it
 *  done (from an event, e.g. closing the form it opened). Null waits for nothing. */
export function useUnhandled(id: number | null) {
  const [done, setDone] = useState<number | null>(null);
  return {
    waiting: id !== null && id !== done,
    handled: () => setDone(id),
  };
}
