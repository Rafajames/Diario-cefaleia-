import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Alert, Badge, Card, Empty, Stat, Table, type Tone } from '@/components/ui'
import { CHART } from '@/config/chart-theme'
import { labelOf } from '@/config/clinical-options'
import { fmtDate, fmtDuration, fmtInstant } from '@/utils/datetime'
import { RESPONSE_CAVEAT } from '@/modules/treatment-response/calc'
import { MenstrualAnalysisView } from '@/modules/menstruation/MenstrualAnalysisView'
import { CRITERIA, TREND_LABEL, type DimensionResult, type Indicators, type Ranked, type Trend } from './calc'
import type { EvolutionResult } from './useEvolution'

const TREND_TONE: Record<Trend, Tone> = { improved: 'good', stable: 'neutral', worsened: 'bad', changed: 'info', insufficient: 'neutral' }
const TREND_ICON: Record<Trend, string> = { improved: '▼', stable: '＝', worsened: '▲', changed: '⇄', insufficient: '?' }
const n = (v: number | null, suffix = '') => (v === null ? '—' : `${String(v).replace('.', ',')}${suffix}`)
const fmtDim = (d: DimensionResult, v: number | null) => (v === null ? '—' : d.unit === 'min' ? fmtDuration(v) : `${n(v)}${d.unit === '%' ? '%' : ''}`)

export const TrendBadge = ({ trend }: { trend: Trend }) => <Badge tone={TREND_TONE[trend]}><span aria-hidden className="mr-1">{TREND_ICON[trend]}</span>{TREND_LABEL[trend]}</Badge>

/** Comparação dimensão a dimensão — sem nota global, para que nenhuma piora fique escondida. */
export function ComparisonTable({ rows }: { rows: DimensionResult[] }) {
  return (
    <Table wrap head={['Dimensão', 'Período anterior', 'Período atual', 'Classificação', 'Critério / observação']}
      rows={rows.map((d) => [
        <span className="font-medium">{d.label}{d.unit && d.unit !== 'min' && d.unit !== '%' && <span className="font-normal text-muted"> ({d.unit})</span>}</span>,
        <>{fmtDim(d, d.previous)} <span className="text-xs text-muted">n={d.nPrevious}</span></>,
        <>{fmtDim(d, d.current)} <span className="text-xs text-muted">n={d.nCurrent}</span></>,
        <TrendBadge trend={d.trend} />,
        <span className="text-xs text-muted">{d.id === 'location' && d.trend !== 'insufficient' ? d.reason.replace(/(Antes|agora): (\w+)/g, (_, a, k) => `${a}: ${labelOf('location', k)}`) : d.reason}</span>,
      ])} />
  )
}

export function DataQuality({ ind }: { ind: Indicators }) {
  const missingIntensity = ind.attackCount - ind.intensityPeak.n
  return (
    <Card title="Qualidade dos dados">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Q k="Período analisado" v={`${fmtDate(ind.period.from)} a ${fmtDate(ind.period.to)} (${ind.days} dias)`} />
        <Q k="Dias com informação" v={`${ind.days - ind.unknownDays} de ${ind.days} (${Math.round(ind.coverage * 100)}%)`} />
        <Q k="Crises registradas" v={String(ind.attackCount)} />
        <Q k="Registros diários" v={String(ind.habits.logs)} />
        <Q k="Crises sem término" v={String(ind.attacksWithoutEnd)} />
        <Q k="Crises sem intensidade" v={String(missingIntensity)} />
        <Q k="Administrações de medicamento" v={String(ind.administrations)} />
        <Q k="Calculado em" v={fmtInstant(ind.computedAt)} />
      </dl>
      <p className="mt-2 text-xs text-muted">Registros autorrelatados. Dias sem informação não são contados como dias sem dor. Dados ausentes nunca são preenchidos por estimativa.</p>
    </Card>
  )
}
const Q = ({ k, v }: { k: string; v: string }) => (<div><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)

function Chart({ title, criterion, children, empty }: { title: string; criterion?: string; children: ReactNode; empty?: boolean }) {
  return (
    <Card title={title}>
      {empty ? <Empty>Sem dados suficientes neste período.</Empty> : <div className="h-56 w-full">{children}</div>}
      {criterion && <p className="mt-2 text-xs text-muted">Critério: {criterion}</p>}
    </Card>
  )
}
const axis = { tick: { fill: CHART.axis, fontSize: 12 }, axisLine: { stroke: CHART.grid }, tickLine: false as const }
const grid = <CartesianGrid stroke={CHART.grid} vertical={false} />
const tip = { contentStyle: { borderRadius: 8, border: `1px solid ${CHART.grid}`, fontSize: 12 }, cursor: { fill: 'rgba(0,0,0,0.04)' } }

function RankTable({ rows, kind, head, withPeak }: { rows: Ranked[]; kind: string; head: string; withPeak?: boolean }) {
  return <Table empty="Sem registros neste período." head={[head, 'Crises', '% das crises', ...(withPeak ? ['Intensidade máx. média'] : [])]}
    rows={rows.map((r) => [labelOf(kind, r.key), r.count, n(r.pct, '%'), ...(withPeak ? [n(r.meanPeak ?? null)] : [])])} />
}

export function EvolutionView({ r, sections = 'all' }: { r: EvolutionResult; sections?: 'all' | 'summary' }) {
  const c = r.current
  const dist = c.peakDistribution.map((count, i) => ({ intensidade: String(i), crises: count }))
  const loc = c.locations.slice(0, 8).map((l) => ({ local: labelOf('location', l.key), crises: l.count }))
  return (
    <div className="space-y-4">
      {r.overuse.map((s, i) => (
        <Alert key={i} tone="warn">
          <strong>Sinalização informativa:</strong> houve uso de medicação para crise ({s.classes.map((k) => labelOf('medCategory', k).toLowerCase()).join(', ')}) em {s.days} dias nos últimos 30 dias
          (limite configurado: {s.threshold}). Isto não é um diagnóstico; converse com o profissional responsável.
        </Alert>
      ))}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Dias com cefaleia" value={c.headacheDays} sub={`de ${c.days} dias`} />
        <Stat label="Dias sem dor confirmados" value={c.painFreeConfirmedDays} sub={`${c.unknownDays} dias sem informação`} />
        <Stat label="Crises" value={c.attackCount} sub={c.disablingAttacks ? `${c.disablingAttacks} incapacitante(s)` : undefined} />
        <Stat label="Intensidade máxima média" value={n(c.intensityPeak.mean)} sub={`mediana ${n(c.intensityPeak.median)} · maior ${n(c.intensityPeak.max)}`} />
        <Stat label="Duração média" value={fmtDuration(c.durationMinutes.mean)} sub={`${c.durationMinutes.n} crise(s) com término`} />
        <Stat label="Horas totais com dor" value={n(c.hoursWithPain, ' h')} sub={c.attacksWithoutEnd ? `${c.attacksWithoutEnd} crise(s) sem término não somadas` : undefined} />
        <Stat label="Dias com medicação para crise" value={c.acuteMedicationDays} sub={`${c.administrations} administração(ões)`} />
        <Stat label="Impacto funcional médio" value={n(c.functionalImpact.mean)} sub="escala 0 a 3" />
      </div>

      <Card title={`Evolução em relação ao período anterior (${fmtDate(r.previousPeriod.from)} a ${fmtDate(r.previousPeriod.to)})`}>
        <ComparisonTable rows={r.comparison} />
        <p className="mt-2 text-xs text-muted">
          Cada dimensão é avaliada separadamente; não existe nota única. Regra: variação relativa de {Math.round(r.rules.relative_threshold * 100)}% ou mais indica mudança;
          dimensões por dia exigem cobertura de registros de {Math.round(r.rules.min_coverage * 100)}% e dimensões por crise exigem ao menos {r.rules.min_attacks} registros em cada período.
        </p>
      </Card>
      <DataQuality ind={c} />
      {sections === 'all' && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Chart title="Dias por mês" criterion={CRITERIA.headacheDays}>
              <ResponsiveContainer>
                <BarChart data={r.series} barCategoryGap="25%">
                  {grid}<XAxis dataKey="month" {...axis} /><YAxis allowDecimals={false} {...axis} width={28} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="headacheDays" name="Com cefaleia" stackId="d" fill={CHART.headache} stroke="#fff" strokeWidth={2} />
                  <Bar dataKey="painFreeDays" name="Sem dor (confirmado)" stackId="d" fill={CHART.painFree} stroke="#fff" strokeWidth={2} />
                  <Bar dataKey="unknownDays" name="Sem informação" stackId="d" fill={CHART.unknown} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Chart>
            <Chart title="Intensidade máxima média por mês (0–10)" criterion={CRITERIA.intensityPeak} empty={!c.intensityPeak.n}>
              <ResponsiveContainer>
                <LineChart data={r.series}>
                  {grid}<XAxis dataKey="month" {...axis} /><YAxis domain={[0, 10]} {...axis} width={28} /><Tooltip {...tip} />
                  <Line type="monotone" dataKey="meanPeak" name="Intensidade máxima média" stroke={CHART.single} strokeWidth={2} dot={{ r: 4 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </Chart>
            <Chart title="Duração média das crises por mês (horas)" criterion={CRITERIA.durationMinutes} empty={!c.durationMinutes.n}>
              <ResponsiveContainer>
                <LineChart data={r.series}>
                  {grid}<XAxis dataKey="month" {...axis} /><YAxis {...axis} width={32} /><Tooltip {...tip} />
                  <Line type="monotone" dataKey="meanDurationHours" name="Duração média (h)" stroke={CHART.single} strokeWidth={2} dot={{ r: 4 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </Chart>
            <Chart title="Dias com medicação para crise por mês" criterion={CRITERIA.acuteMedicationDays} empty={!c.administrations}>
              <ResponsiveContainer>
                <BarChart data={r.series} barCategoryGap="35%">
                  {grid}<XAxis dataKey="month" {...axis} /><YAxis allowDecimals={false} {...axis} width={28} /><Tooltip {...tip} />
                  <Bar dataKey="medicationDays" name="Dias com medicação" fill={CHART.single} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Chart>
            <Chart title="Distribuição das crises por intensidade máxima" empty={!c.intensityPeak.n}>
              <ResponsiveContainer>
                <BarChart data={dist} barCategoryGap="20%">
                  {grid}<XAxis dataKey="intensidade" {...axis} /><YAxis allowDecimals={false} {...axis} width={28} /><Tooltip {...tip} />
                  <Bar dataKey="crises" name="Crises" fill={CHART.single} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Chart>
            <Chart title="Localização da dor (crises por região)" empty={!loc.length}>
              <ResponsiveContainer>
                <BarChart data={loc} layout="vertical" barCategoryGap="25%">
                  <CartesianGrid stroke={CHART.grid} horizontal={false} /><XAxis type="number" allowDecimals={false} {...axis} /><YAxis type="category" dataKey="local" {...axis} width={130} /><Tooltip {...tip} />
                  <Bar dataKey="crises" name="Crises" fill={CHART.single} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Chart>
          </div>
          <Card title="Série mensal (tabela)">
            <Table head={['Mês', 'Dias c/ cefaleia', 'Dias sem dor conf.', 'Dias sem informação', 'Crises', 'Intens. máx. média', 'Duração média (h)', 'Dias c/ medicação', 'Impacto médio']}
              rows={r.series.map((m) => [m.month, m.headacheDays, m.painFreeDays, m.unknownDays, m.attacks, n(m.meanPeak), n(m.meanDurationHours), m.medicationDays, n(m.meanImpact)])} />
          </Card>
          <Details r={r} />
        </>
      )}
    </div>
  )
}

/** Tabelas detalhadas (também usadas, por aba, na visão do profissional). */
export function IntensityCard({ c }: { c: Indicators }) {
  const row = (label: string, s: Indicators['intensityPeak']) => [label, s.n, n(s.mean), n(s.median), n(s.min), n(s.max), s.missing]
  return (
    <Card title="Intensidade (0–10)">
      <Table head={['Momento', 'Crises com dado', 'Média', 'Mediana', 'Mínima', 'Máxima', 'Sem dado']}
        rows={[row('No início', c.intensityInitial), row('No pico', c.intensityPeak), row('Após tratamento', c.intensityAfterTreatment), row('Ao término', c.intensityFinal)]} />
      <p className="mt-2 text-xs text-muted">Após tratamento: {CRITERIA.intensityAfterTreatment}</p>
    </Card>
  )
}

export function ResponseCard({ c }: { c: Indicators }) {
  return (
    <Card title="Resposta aos medicamentos">
      <Table empty="Nenhuma administração registrada neste período."
        head={['Medicamento', 'Usos', 'Doses', 'Intens. antes (média)', 'Tempo até medicar (mediana)', 'Início do alívio (mediana)', 'Redução média', 'Alívio completo', 'Parcial', 'Sem resposta', 'Recorrência', 'Efeitos adversos']}
        rows={c.responseByMedication.map((m) => [
          <strong>{m.key}</strong>, m.uses, m.doses.join(', ') || '—', n(m.intensityBefore.mean), fmtDuration(m.minutesToMedication.median), fmtDuration(m.minutesToReliefOnset.median),
          n(m.intensityReduction.mean), `${n(m.completePct, '%')} (n=${m.outcomesReported})`, n(m.partialPct, '%'), n(m.nonePct, '%'), `${n(m.recurrencePct, '%')} (n=${m.recurrenceReported})`, m.adverseEffects,
        ])} />
      <p className="mt-2 text-xs text-muted">{RESPONSE_CAVEAT}</p>
    </Card>
  )
}

export function HabitsCard({ c }: { c: Indicators }) {
  const h = c.habits
  const row = (label: string, s: Indicators['intensityPeak'], unit = '') => [label, s.n, n(s.mean, unit), n(s.min, unit), n(s.max, unit)]
  return (
    <Card title="Hábitos (registro diário)">
      <Table head={['Item', 'Dias com registro', 'Média', 'Mínimo', 'Máximo']}
        rows={[row('Horas de sono', h.sleepHours, ' h'), row('Qualidade do sono (1–5)', h.sleepQuality), row('Hidratação', h.hydration, ' L'), row('Cafeína (doses)', h.caffeine), row('Estresse (1–5)', h.stress), row('Humor (1–5)', h.mood)]} />
      <p className="mt-2 text-xs text-muted">{h.logs} registro(s) diário(s) no período. Descritivo: não indica relação de causa com as crises.</p>
    </Card>
  )
}

export function TriggersCard({ c }: { c: Indicators }) {
  return (
    <Card title="Possíveis fatores associados (autorrelato)">
      <Table empty="Nenhum fator registrado neste período." head={['Categoria', 'Fator', 'Crises em que apareceu', '% das crises', 'Marcado como suspeita', 'Marcado como "ocorreu antes"']}
        rows={c.triggers.map((t) => [labelOf('triggerCategory', t.category), labelOf('factor', t.factor), t.attacks >= 3 ? <>{t.attacks} <Badge tone="info">repetido</Badge></> : t.attacks, n(t.pctOfAttacks, '%'), t.suspected, t.occurredBefore])} />
      <p className="mt-2 text-xs text-muted">Associação observada não é causa comprovada. "Repetido" indica apenas que o fator foi registrado em 3 ou mais crises do período.</p>
    </Card>
  )
}

function Details({ r }: { r: EvolutionResult }) {
  const c = r.current
  return (
    <>
      <IntensityCard c={c} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Localização"><RankTable rows={c.locations} kind="location" head="Região" withPeak /></Card>
        <Card title="Lado"><RankTable rows={c.sides} kind="side" head="Lado" /></Card>
        <Card title="Sintomas associados"><RankTable rows={c.symptoms} kind="symptom" head="Sintoma" /></Card>
        <Card title="Características da dor"><RankTable rows={c.qualities} kind="quality" head="Característica" /></Card>
      </div>
      <TriggersCard c={c} />
      <Card title="Consumo de medicamentos para crise">
        <div className="grid gap-4 lg:grid-cols-2">
          <Table empty="Sem registros." head={['Medicamento', 'Administrações', '%']} rows={c.byMedication.map((m) => [m.key, m.count, n(m.pct, '%')])} />
          <Table empty="Sem registros." head={['Classe', 'Administrações', '%']} rows={c.byClass.map((m) => [labelOf('medCategory', m.key), m.count, n(m.pct, '%')])} />
        </div>
      </Card>
      <ResponseCard c={c} />
      <HabitsCard c={c} />
      {c.menstrual && <Card title="Cefaleia e período menstrual"><MenstrualAnalysisView analysis={c.menstrual} /></Card>}
    </>
  )
}
