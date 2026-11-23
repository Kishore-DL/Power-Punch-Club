import { useEffect, useRef } from 'react';

export function useDialogFocus(open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const dialog = document.querySelector<HTMLElement>('[data-focus-dialog]');
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href]',
    )].filter(element => element.offsetParent !== null && element.tabIndex !== -1);
    controls()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      const activeNativeDialog = document.querySelector('dialog[open]');
      if (activeNativeDialog && activeNativeDialog !== dialog) return;
      // A native dialog in the top layer owns its own keys. Use the retained
      // event path because its close handler may already have unmounted it.
      const nested = event.composedPath().find(node => node instanceof HTMLElement && node.tagName === 'DIALOG');
      if (nested && nested !== dialog) return;
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = controls();
      const first = elements[0], last = elements.at(-1);
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
}
