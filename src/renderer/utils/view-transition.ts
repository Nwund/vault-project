// File: src/renderer/utils/view-transition.ts
//
// #337 F-113 — View Transitions API helper. Wraps the native
// document.startViewTransition() with a graceful fallback for browsers
// that haven't shipped support yet (Chrome 111+, Safari 18+, Firefox
// behind flag in 2026-05).
//
// Two surfaces:
//   transitionTo(updateDom)          — single-DOM transition (whole
//                                       app re-render).
//   transitionWithName(name, update) — sets view-transition-name CSS
//                                       on the source element so the
//                                       morph happens between matching
//                                       names across views (used by
//                                       #338 Motion 12 layoutId
//                                       equivalents).

export async function transitionTo(updateDom: () => void | Promise<void>): Promise<void> {
  const start: ((cb: () => void | Promise<void>) => { finished: Promise<void> }) | undefined =
    (document as any).startViewTransition
  if (!start) {
    await updateDom()
    return
  }
  const t = start.call(document, updateDom)
  await t.finished
}

export async function transitionWithName(
  sourceEl: HTMLElement | null,
  transitionName: string,
  updateDom: () => void | Promise<void>,
): Promise<void> {
  if (sourceEl) sourceEl.style.viewTransitionName = transitionName
  await transitionTo(updateDom)
  if (sourceEl) sourceEl.style.viewTransitionName = ''
}

/** Pair helper: source element gets transitionName before update; the
 *  destination element (which will be created by updateDom) also gets
 *  the same transitionName via a queryselector after the DOM swap. */
export async function transitionPaired(
  source: { el: HTMLElement | null; name: string },
  destinationSelector: string,
  updateDom: () => void | Promise<void>,
): Promise<void> {
  if (source.el) source.el.style.viewTransitionName = source.name
  await transitionTo(async () => {
    await updateDom()
    const dest = document.querySelector<HTMLElement>(destinationSelector)
    if (dest) dest.style.viewTransitionName = source.name
  })
  if (source.el) source.el.style.viewTransitionName = ''
  const dest = document.querySelector<HTMLElement>(destinationSelector)
  if (dest) dest.style.viewTransitionName = ''
}
