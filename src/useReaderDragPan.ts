import { useEffect, type RefObject } from 'react';
import { dragPanScroll, stageCanPan } from './shared/dragPan';

/** Left-click drag pans `.reader-stage` when content overflows (zoomed images/PDF). */
export function useReaderDragPan(hostRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stage = host.closest('.reader-stage');
    if (!(stage instanceof HTMLElement)) return;

    let dragging = false;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      pointerId = null;
      stage.classList.remove('is-panning');
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!stageCanPan(stage)) return;
      dragging = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      scrollLeft = stage.scrollLeft;
      scrollTop = stage.scrollTop;
      stage.classList.add('is-panning');
      host.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== pointerId) return;
      const next = dragPanScroll(
        scrollLeft,
        scrollTop,
        startX,
        startY,
        event.clientX,
        event.clientY,
      );
      stage.scrollLeft = next.left;
      stage.scrollTop = next.top;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      endDrag();
    };

    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', onPointerUp);
    host.addEventListener('pointercancel', onPointerUp);
    host.addEventListener('lostpointercapture', endDrag);

    return () => {
      endDrag();
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', onPointerUp);
      host.removeEventListener('pointercancel', onPointerUp);
      host.removeEventListener('lostpointercapture', endDrag);
    };
  }, [hostRef]);
}
