import type { CardType } from '@rcoi/shared';
import type { PointerEvent, RefObject } from 'react';
import { create } from 'zustand';

interface PreviewState {
  type: CardType | null;
  rect: DOMRect | null;
  show(type: CardType, rect: DOMRect): void;
  hide(): void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  type: null,
  rect: null,
  show: (type, rect) => set({ type, rect }),
  hide: () => set({ type: null, rect: null }),
}));

let timer: ReturnType<typeof setTimeout> | null = null;
const clear = () => {
  if (timer) clearTimeout(timer);
  timer = null;
};

/**
 * Larger preview: after a short hover with a mouse, or a long press on touch.
 * A normal tap still selects the card.
 */
export function usePreview() {
  const { show, hide } = usePreviewStore.getState();
  const bind = (type: CardType, ref: RefObject<HTMLElement | null>) => ({
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      clear();
      timer = setTimeout(() => ref.current && show(type, ref.current.getBoundingClientRect()), 380);
    },
    onPointerLeave: () => {
      clear();
      hide();
    },
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        clear();
        hide();
        return;
      }
      clear();
      timer = setTimeout(() => ref.current && show(type, ref.current.getBoundingClientRect()), 420);
    },
    onPointerUp: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      clear();
      hide();
    },
    onPointerCancel: () => {
      clear();
      hide();
    },
    onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(),
  });
  return { bind };
}
