"use client";

/** 共享 UI 基元。全部引用 token 层语义色，不写死十六进制（§7）。 */
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";

function cx(...cls: (string | false | undefined)[]) {
  return cls.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "ghost" | "danger";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }
>(function Button({ className, variant = "ghost", ...props }, ref) {
  const base =
    "label-mono inline-flex items-center justify-center gap-2 rounded-sm border px-3 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed select-none";
  const variants: Record<BtnVariant, string> = {
    primary:
      "border-border-focus bg-fg-primary text-bg-void hover:bg-fg-secondary",
    ghost:
      "border-border bg-transparent text-fg-secondary hover:bg-bg-hover hover:text-fg-primary",
    danger:
      "border-contradict/50 bg-transparent text-contradict hover:bg-contradict/10",
  };
  return (
    <button ref={ref} className={cx(base, variants[variant], className)} {...props} />
  );
});

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        "w-full rounded-sm border border-border bg-bg-void px-3 py-2 text-fg-primary placeholder:text-fg-tertiary outline-none focus:border-border-focus transition-colors",
        className,
      )}
      {...props}
    />
  );
});

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="label-mono block text-fg-secondary">{label}</span>
      {children}
      {hint && <span className="block text-xs text-fg-tertiary">{hint}</span>}
    </label>
  );
}

/** 选项卡片（研究类型 / 单选组）。 */
export function SelectCard({
  selected,
  onClick,
  title,
  lines,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  lines?: string[];
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex w-full flex-col gap-2 rounded-sm border p-4 text-left transition-colors",
        selected
          ? "border-border-focus bg-bg-raised"
          : "border-border bg-bg-surface hover:bg-bg-hover",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      <span className="font-sans text-sm text-fg-primary">{title}</span>
      {lines?.map((l, i) => (
        <span key={i} className="label-mono text-fg-tertiary">
          {l}
        </span>
      ))}
    </button>
  );
}

/** 单选 pill 组。 */
export function RadioGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-sm border px-3 py-2 text-sm transition-colors",
            value === o.value
              ? "border-border-focus bg-bg-raised text-fg-primary"
              : "border-border bg-transparent text-fg-secondary hover:bg-bg-hover",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
