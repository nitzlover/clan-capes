'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type SelectOption = {
  value: string;
  label: string;
  /** Optional muted suffix shown right of the label (id, hint, count…). */
  sublabel?: string;
  disabled?: boolean;
};

type Props = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Min width on the trigger; defaults to 180px. */
  minWidth?: number;
  'aria-label'?: string;
};

/**
 * Generic B&W custom select — a button-triggered listbox popover that
 * replaces the native `<select>`.
 *
 * <p>Why this exists: a native `<select>`'s OPEN option list is painted
 * by the operating system / browser, not by our CSS — so it shows the
 * OS accent (bright blue highlight) no matter how the closed trigger is
 * styled. The only way to keep the dropdown strictly monochrome is to
 * render our own popover, which is what this component does.
 *
 * <p>Styled with the shared `.select-trigger` / `.popover-panel` /
 * `.popover-item` primitives so it matches `.input` exactly. ARIA:
 * trigger is a `<button>` with `aria-haspopup="listbox"` +
 * `aria-expanded`; the menu is `role="listbox"`, each row is
 * `role="option"` with `aria-selected`. Click-outside and Escape both
 * dismiss; Up/Down/Enter navigate.
 */
export function Select({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled,
  className = '',
  minWidth = 180,
  'aria-label': ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  // Click-outside + Escape close, both behaviours a native menu has but
  // a bare popover does not.
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

  // Seed the keyboard cursor at the current value when the menu opens.
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setActiveIdx(idx);
    }
  }, [open, options, value]);

  function commit(idx: number) {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onTriggerKey(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(activeIdx);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`} style={{ minWidth }}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        className="select-trigger"
      >
        <span className="min-w-0 truncate">
          {selected ? (
            <span className="font-sans text-sm font-medium text-white">
              {selected.label}
              {selected.sublabel && (
                <span className="ml-2 font-sans text-xs font-medium text-[var(--text-faint)]">
                  {selected.sublabel}
                </span>
              )}
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
          id={listId}
          role="listbox"
          tabIndex={-1}
          className="popover-panel absolute left-0 right-0 top-full z-40 mt-2 max-h-72 overflow-y-auto"
        >
          {options.length === 0 ? (
            <li className="px-4 py-3 font-sans text-sm font-medium text-[var(--text-faint)]">
              No options
            </li>
          ) : (
            options.map((o, idx) => {
              const active = o.value === value;
              const cursor = idx === activeIdx;
              return (
                <li key={o.value || `opt-${idx}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={o.disabled}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => commit(idx)}
                    className={`popover-item ${active ? 'is-active' : ''} ${
                      cursor && !active ? 'bg-[var(--surface-2)]' : ''
                    } ${o.disabled ? 'opacity-40' : ''}`}
                  >
                    <span className="font-sans text-sm font-medium">{o.label}</span>
                    {o.sublabel && (
                      <span
                        className={`font-sans text-xs font-medium ${
                          active ? 'text-black/60' : 'text-[var(--text-faint)]'
                        }`}
                      >
                        {o.sublabel}
                      </span>
                    )}
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
