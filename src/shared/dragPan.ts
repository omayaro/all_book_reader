/** Map pointer drag delta to scroll position (grab-to-pan). */
export function dragPanScroll(
  startScrollLeft: number,
  startScrollTop: number,
  startClientX: number,
  startClientY: number,
  clientX: number,
  clientY: number,
): { left: number; top: number } {
  return {
    left: startScrollLeft - (clientX - startClientX),
    top: startScrollTop - (clientY - startClientY),
  };
}

export function stageCanPan(stage: {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}): boolean {
  return (
    stage.scrollWidth > stage.clientWidth + 1 ||
    stage.scrollHeight > stage.clientHeight + 1
  );
}
