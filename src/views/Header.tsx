import { useEffect, useState, type ReactNode } from 'react';
import type { TaskDefaults } from '../actions';
import { IconPlus } from '../components/icons';
import { QuickAdd } from '../components/QuickAdd';

export function Header({ title, subtitle, eyebrow, crumb, defaults, actions, children }: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  crumb?: ReactNode;
  defaults?: TaskDefaults;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  return (
    <header className="panel header">
      <div className="header-top">
        <div>
          {crumb}
          {eyebrow && <p className="muted small eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {subtitle && <p className="muted header-sub">{subtitle}</p>}
        </div>
        {actions && <div className="header-actions">{actions}</div>}
      </div>
      {children}
      {defaults && <QuickAdd id="quick-add" defaults={defaults} />}
      {defaults && (
        <>
          {/* Phone: round "+" button that opens quick add from the bottom, like in Todoist */}
          <button type="button" className="fab" aria-label="Dodaj zadanie" onClick={() => setSheet(true)}>
            <IconPlus />
          </button>
          {sheet && (
            <div className="sheet-overlay" onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
              <div className="sheet" role="dialog" aria-label="Nowe zadanie">
                <QuickAdd id="quick-add-sheet" defaults={defaults} label="Nowe zadanie" autoFocus />
              </div>
            </div>
          )}
        </>
      )}
    </header>
  );
}
