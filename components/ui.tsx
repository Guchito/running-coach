import Link from "next/link";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-card border border-border rounded-2xl ${className}`}>{children}</div>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </Card>
  );
}

export function PageShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-8 pt-20 md:pt-8 pb-24 md:pb-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted mt-1 text-sm">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// Press feedback (active:scale) makes every button feel like it's listening.
// Transitions name their properties: transform for the press, colors for
// hover, never `all`.
const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium " +
  "transition-[transform,background-color,border-color,color] duration-150 ease-out " +
  "active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";

const buttonStyles = {
  primary: "bg-accent text-white hover:bg-accent-strong",
  soft: "bg-accent-soft text-accent hover:bg-indigo-100",
  ghost: "text-foreground/70 hover:bg-black/4 border border-border",
} as const;

export function Button({
  href,
  children,
  variant = "primary",
  className = "",
  ...props
}: {
  href?: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "soft";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = `${buttonBase} ${buttonStyles[variant]} ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}

// Rows/cards that navigate somewhere: consistent hover tint + press feedback.
// One tint (black/4) everywhere, instead of the black/2-/3-/5 drift.
export const interactiveRow =
  "transition-[transform,background-color] duration-150 ease-out hover:bg-black/4 active:scale-[0.995]";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-10 text-center">
      <div className="text-lg font-medium">{title}</div>
      <p className="text-muted text-sm mt-1 max-w-md mx-auto">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Card>
  );
}
