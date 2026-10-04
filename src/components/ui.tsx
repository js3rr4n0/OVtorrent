import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 min-h-12 min-w-12 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const variants: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400',
  secondary:
    'border border-[var(--ovt-border)] bg-[var(--ovt-surface)] text-[var(--ovt-text)] hover:bg-black/5 dark:hover:bg-white/10',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  ghost: 'text-[var(--ovt-text)] hover:bg-black/5 dark:hover:bg-white/10',
};

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={`${base} ${variants[variant]} ${className}`} {...rest} />;
}

export function LinkButton({
  variant = 'secondary',
  className = '',
  ...rest
}: LinkProps & { variant?: Variant; className?: string }) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...rest} />;
}

export function Card({
  children,
  className = '',
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`ovt-surface rounded-lg p-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tv:text-4xl">{title}</h1>
        {subtitle ? <p className="ovt-muted mt-1 max-w-3xl">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Notice({
  kind = 'info',
  title,
  children,
  role,
}: {
  kind?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children: ReactNode;
  role?: 'alert' | 'status';
}) {
  const styles = {
    info: 'border-blue-400/60 bg-blue-500/10',
    warning: 'border-amber-400/70 bg-amber-500/10',
    error: 'border-red-500/70 bg-red-500/10',
    success: 'border-green-500/70 bg-green-500/10',
  }[kind];
  return (
    <div
      className={`rounded-md border px-4 py-3 text-sm ${styles}`}
      role={role ?? (kind === 'error' ? 'alert' : 'status')}
    >
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="ovt-muted mt-1 text-xs tv:text-base">{hint}</p> : null}
      {error ? (
        <p className="mt-1 text-xs text-red-500 tv:text-base" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  'w-full rounded-md border border-[var(--ovt-border)] bg-[var(--ovt-surface)] px-3 py-2 min-h-12 text-[var(--ovt-text)]';

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...rest} />;
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${inputClass} ${className}`} {...rest} />;
}

export function Toggle({
  id,
  label,
  checked,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-6 w-6 min-h-6 min-w-6"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className="min-h-12 flex-1 py-1">
        <span className="block font-medium">{label}</span>
        {hint ? <span className="ovt-muted block text-xs tv:text-base">{hint}</span> : null}
      </label>
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad';
}) {
  const t = {
    neutral: 'bg-gray-500/15 text-[var(--ovt-text)]',
    ok: 'bg-green-500/20 text-green-700 dark:text-green-300',
    warn: 'bg-amber-500/20 text-amber-800 dark:text-amber-200',
    bad: 'bg-red-500/20 text-red-700 dark:text-red-300',
  }[tone];
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium tv:text-base ${t}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="text-center">
      <p className="text-lg font-medium">{title}</p>
      {children ? <div className="ovt-muted mt-2 text-sm tv:text-lg">{children}</div> : null}
    </Card>
  );
}
