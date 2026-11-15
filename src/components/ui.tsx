/** Componentes de interface reutilizáveis. Sem regra de negócio. */
import { cloneElement, isValidElement, useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { Option } from '@/config/clinical-options'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

const BTN = {
  primary: 'bg-brand text-on-brand hover:bg-brand-dark',
  secondary: 'bg-card text-brand border border-brand hover:bg-brand-soft',
  ghost: 'text-brand hover:bg-brand-soft',
  danger: 'bg-danger text-white hover:opacity-90',
}

export function Button({ variant = 'primary', small, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN; small?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        small ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5', BTN[variant], className)}
    />
  )
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-line bg-card p-4 shadow-sm', className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

/** Seção recolhível de formulário */
export function Section({ title, hint, open, children }: { title: string; hint?: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-xl border border-line bg-card shadow-sm">
      <summary className="flex items-center justify-between gap-3 px-4 py-3 font-semibold">
        <span>{title}{hint && <span className="ml-2 text-sm font-normal text-muted">{hint}</span>}</span>
        <span className="text-muted transition group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="space-y-4 border-t border-line p-4">{children}</div>
    </details>
  )
}

const INPUT = 'w-full rounded-lg border border-muted bg-card px-3 py-2 text-ink placeholder:text-muted/70 disabled:bg-surface disabled:text-muted'
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(INPUT, p.className)} />
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx(INPUT, p.className)} />
export function Select({ options, placeholder, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { options: Option[]; placeholder?: string }) {
  return (
    <select {...p} className={cx(INPUT, p.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

const CONTROLS = new Set<unknown>([Input, Textarea, Select])

/**
 * Campo de formulário. Para controles simples (Input/Select/Textarea) associa <label for>;
 * para grupos (chips, escala de intensidade) usa role="group" — um <label> envolvendo botões
 * faria o clique no rótulo acionar o primeiro botão.
 */
export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  const id = useId()
  const control = isValidElement<Record<string, unknown>>(children) && CONTROLS.has(children.type)
  const describedBy = hint || error ? `${id}-d` : undefined
  return (
    <div className={cx('block text-sm', className)} role={control ? undefined : 'group'} aria-labelledby={control ? undefined : `${id}-l`}>
      {control
        ? <label htmlFor={id} className="mb-1 block font-medium text-ink">{label}</label>
        : <span id={`${id}-l`} className="mb-1 block font-medium text-ink">{label}</span>}
      {control ? cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined }) : children}
      {hint && !error && <span id={describedBy} className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span id={describedBy} role="alert" className="mt-1 block text-xs text-danger">{error}</span>}
    </div>
  )
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

/** Seleção múltipla (ou única) em "chips" */
export function Chips({ options, value, onChange, single, disabled }: { options: Option[]; value: string[]; onChange: (v: string[]) => void; single?: boolean; disabled?: boolean }) {
  const toggle = (v: string) =>
    onChange(single ? (value.includes(v) ? [] : [v]) : value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button key={o.value} type="button" disabled={disabled} aria-pressed={on} onClick={() => toggle(o.value)}
            className={cx('rounded-full border px-3 py-1.5 text-sm transition', on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-card text-ink hover:border-brand')}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Sim / Não / (não informado) */
export function TriState({ value, onChange, labels = ['Sim', 'Não'] }: { value: boolean | null; onChange: (v: boolean | null) => void; labels?: [string, string] }) {
  return (
    <Chips single options={[{ value: 'y', label: labels[0] }, { value: 'n', label: labels[1] }]}
      value={value === null ? [] : [value ? 'y' : 'n']} onChange={(v) => onChange(v.length ? v[0] === 'y' : null)} />
  )
}

const INTENSITY_BG = (n: number) => (n === 0 ? 'bg-day-none' : n <= 3 ? 'bg-day-mild' : n <= 6 ? 'bg-day-moderate' : 'bg-day-severe text-white')

/** Escala numérica de dor 0–10. Clicar no valor selecionado limpa (intensidade é opcional). */
export function IntensityInput({ value, onChange, disabled }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Intensidade de 0 a 10">
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} disabled={disabled} onClick={() => onChange(value === n ? null : n)}
            className={cx('h-9 w-9 rounded-lg border text-sm font-semibold transition', value === n ? cx(INTENSITY_BG(n), 'border-ink ring-2 ring-ink') : 'border-line bg-card hover:border-brand')}>
            {n}
          </button>
        ))}
      </div>
      <p className="mt-1 flex justify-between text-xs text-muted"><span>0 = sem dor</span><span>10 = pior dor imaginável</span></p>
    </div>
  )
}

const TONES = {
  neutral: 'bg-surface text-muted border-line',
  good: 'bg-brand-soft text-brand border-brand/30',
  bad: 'bg-danger-soft text-danger border-danger/30',
  warn: 'bg-warn-soft text-warn border-warn/30',
  info: 'bg-info-soft text-info border-info/30',
}
export type Tone = keyof typeof TONES
export const Badge = ({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) => (
  <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', TONES[tone])}>{children}</span>
)

export const Alert = ({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) => (
  <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('rounded-lg border px-3 py-2 text-sm', TONES[tone])}>{children}</div>
)

export const Spinner = ({ label = 'Carregando…' }: { label?: string }) => (
  <div className="flex items-center gap-2 p-4 text-sm text-muted" role="status">
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" /> {label}
  </div>
)

export const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-lg bg-surface p-4 text-center text-sm text-muted">{children}</p>

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-labelledby={id} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-card p-4 shadow-xl sm:max-w-xl sm:rounded-2xl">
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 id={id} className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg px-2 py-1 text-muted hover:bg-surface">✕</button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function Tabs({ tabs, value, onChange }: { tabs: Option[]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="tablist" className="no-print flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.value} role="tab" type="button" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', value === t.value ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  )
}

/** Tabela simples e responsiva (rolagem horizontal em telas pequenas) */
export function Table({ head, rows, empty = 'Sem dados.', wrap }: { head: ReactNode[]; rows: ReactNode[][]; empty?: string; wrap?: boolean }) {
  if (!rows.length) return <Empty>{empty}</Empty>
  return (
    <div className="overflow-x-auto">
      <table className={cx('w-full text-left text-sm', wrap ? 'min-w-[640px]' : 'min-w-max')}>
        <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-muted">{head.map((h, i) => <th key={i} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line/60 last:border-0">{r.map((c, j) => <td key={j} className="px-2 py-2 align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export const PageTitle = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
    <h1 className="text-xl font-bold text-ink">{children}</h1>
    {action}
  </div>
)
