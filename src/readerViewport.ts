/** Extra inset so fit sizing never sits on the scrollbar overflow edge. */
export const VIEWPORT_FIT_INSET_PX = 2;

/** Measure the readable area inside `.reader-stage` (padding excluded). */
export function measureReaderStage(fromEl: Element | null): { width: number; height: number } {
  const stage =
    (fromEl?.closest('.reader-stage') as HTMLElement | null) ??
    (fromEl instanceof HTMLElement ? fromEl : null);
  if (!stage) return { width: 800, height: 600 };
  const style = window.getComputedStyle(stage);
  const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const borderX =
    (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
  const borderY =
    (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  // Use offset* (border box), not client* — clientWidth shrinks when scrollbars
  // appear and feeds back into zoom/fit layout (fullscreen edge jitter).
  return {
    width: Math.max(40, stage.offsetWidth - padX - borderX - VIEWPORT_FIT_INSET_PX),
    height: Math.max(40, stage.offsetHeight - padY - borderY - VIEWPORT_FIT_INSET_PX),
  };
}

/** Ignore sub-pixel / small ResizeObserver noise that can feedback into zoom layout. */
export function stabilizeViewportSize(
  prev: { width: number; height: number },
  next: { width: number; height: number },
  threshold = 4,
): { width: number; height: number } {
  if (
    Math.abs(prev.width - next.width) < threshold &&
    Math.abs(prev.height - next.height) < threshold
  ) {
    return prev;
  }
  return next;
}
