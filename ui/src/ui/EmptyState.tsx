import { Button } from './Button';
import { Icon, type IconName } from './Icon';

/**
 * Empty state: 20px icon, one-line title, optional one-line hint, at most one primary CTA.
 * Props: title, hint?, icon?, action?: { label, onClick }, overlay? (centred over its positioned parent,
 * e.g. over a timeline grid; the parent must be `position: relative`).
 * Usage: <EmptyState icon="plus" title="No projects yet" action={{ label: 'New project', onClick: openNewProject }} overlay />
 */
export interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: IconName;
  action?: { label: string; onClick: () => void };
  overlay?: boolean;
}

export function EmptyState({ title, hint, icon, action, overlay }: EmptyStateProps) {
  return (
    <div className={`gp-empty${overlay ? ' gp-empty--overlay' : ''}`}>
      <div className="gp-empty__body">
        {icon && (
          <span className="gp-empty__icon">
            <Icon name={icon} size={20} />
          </span>
        )}
        <p className="gp-empty__title">{title}</p>
        {hint && <p className="gp-empty__hint">{hint}</p>}
        {action && <Button variant="primary" label={action.label} onClick={action.onClick} />}
      </div>
    </div>
  );
}
