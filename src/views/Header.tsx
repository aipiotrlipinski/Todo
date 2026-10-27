import type { ReactNode } from 'react';
import type { TaskDefaults } from '../actions';
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
  return (
    <header className="panel header">
      <div className="header-top">
        <div>
          {crumb}
          {eyebrow && <p className="muted small">{eyebrow}</p>}
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions && <div className="header-actions">{actions}</div>}
      </div>
      {children}
      {defaults && <QuickAdd id="quick-add" defaults={defaults} />}
    </header>
  );
}
