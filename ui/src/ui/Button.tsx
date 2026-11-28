import type { MouseEvent } from 'react';
import { Icon, type IconName } from './Icon';

export interface ButtonProps {
  variant: 'primary' | 'secondary' | 'quiet' | 'icon';
  /** Visible text; for the icon variant it is the aria-label (required). */
  label?: string;
  icon?: IconName;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  type?: 'button' | 'submit';
}

export function Button({ variant, label, icon, onClick, disabled, title, className, type = 'button' }: ButtonProps) {
  if (variant === 'icon' && !label) console.error('Button: the icon variant requires a label (used as aria-label)');
  const isIcon = variant === 'icon';
  return (
    <button
      type={type}
      className={`gp-btn gp-btn--${variant}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={isIcon ? label : undefined}
    >
      {icon && <Icon name={icon} size={isIcon || variant === 'quiet' ? 14 : 16} />}
      {!isIcon && label}
    </button>
  );
}
