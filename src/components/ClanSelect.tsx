'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClanOption } from '@/lib/api';

type Props = {
  value: string;
  options: ClanOption[];
  onChange: (tag: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Custom B&W clan dropdown.
 *
 * Replaces the native `<select>` because operating systems insist on
 * painting that control with their own (very-not-monochrome) menu
 * background, defeating the brutalist shell. This component is a
 * button-triggered listbox popover styled to match the rest of the
 * admin surface — sharp 2px white border, hard offset shadow, and a
 * white-on-black selected row.
 *
 * The listbox uses standard ARIA roles so it stays keyboard- and
 * screen-reader friendly:
 *   - The trigger is a plain `<button>` with aria-haspopup and
 *     aria-expanded.
 *   - The menu is `role="listbox"`, each option is `role="option"`
 *     with aria-selected reflecting the current value.
 *   - Click-outside and the Escape key both dismiss the popover.
 */
export function ClanSelect({
  value,
  options,
  onChange,
  disabled,
  placeholder = 'Select clan tag…',
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close the popover when the user clicks anywhere outside the root, or
  // when they press Escape. Both behaviours are expected for any modal-
  // ish menu, and neither is provided by `<details>` so we wire them
  // explicitly.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.tag === value) ?? null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="select-trigger"
      >
        <span className="min-w-0 truncate">
          {selected ? (
            <span className="font-sans text-sm font-semibold text-white">
              {selected.tag}
              <span className="ml-2 font-sans text-xs font-medium text-[var(--text-faint)]">
                #{selected.id}
                {selected.hasCape ? ' · cape set' : ''}
              </span>
            </span>
          ) : (
            <span className="font-sans text-sm font-medium text-[var(--text-faint)]">
              {placeholder}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className="material-symbols-outlined text-[var(--text-mute)] transition-transform"
          style={{ fontSize: 18, transform: open ? 'rotate(180deg)' : 'none' }}
        >
          expand_more
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          tabIndex={-1}
          className="popover-panel absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto"
        >
          {options.length === 0 ? (
            <li className="px-4 py-3 font-sans text-sm font-medium text-[var(--text-faint)]">
              No clans
            </li>
          ) : (
            options.map((o) => {
              const active = o.tag === value;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(o.tag);
                      setOpen(false);
                      buttonRef.current?.focus();
                    }}
                    className={`popover-item ${active ? 'is-active' : ''}`}
                  >
                    <span className="font-sans text-sm font-semibold">
                      {o.tag}
                    </span>
                    <span
                      className={`font-sans text-xs font-medium ${
                        active ? 'text-black/60' : 'text-[var(--text-faint)]'
                      }`}
                    >
                      #{o.id}
                      {o.hasCape ? ' · cape set' : ''}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
