import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Empty, Field, Input, PageTitle, Select, Spinner, Table, Tabs, Textarea } from '@/components/ui'
import { PeriodPicker, usePeriod } from '@/components/PeriodPicker'
import { labelOf } from '@/config/clinical-options'
import { useAction } from '@/hooks/useDraft'
import type { ClinicalNote } from '@/types/database'
import { addDays, dateOf, fmtDate, fmtDateTime, fmtInstant, todayLocal } from '@/utils/datetime'
import { downloadText, toCsv } from '@/utils/csv'
import { friendlyError } from '@/utils/errors'
import { useProfile } from '@/modules/authentication/AuthProvider'
import { CalendarView } from '@/modules/calendar/CalendarView'
import { EvolutionView, HabitsCard, IntensityCard, ResponseCard, TriggersCard } from '@/modules/clinical-evolution/EvolutionView'
import { buildEvolution, useEvolution } from '@/modules/clinical-evolution/useEvolution'
import { useSettings } from '@/services/settings'
import { buildDemoDataset, DEMO_NAME } from './demo'
import { AttackList } from '@/modules/headache-attacks/AttackList'
import { PreventiveList } from '@/modules/medications/MedicationsPage'
import { fetchPreventives } from '@/modules/medications/service'
import { MenstrualAnalysisView } from '@/modules/menstruation/MenstrualAnalysisView'
import { PatientScopeProvider, usePatientScope } from '@/modules/patients/scope'
import { fetchPatient } from '@/modules/patients/service'
import { ReportPanel } from '@/modules/reports/ReportPanel'
import { clearFollowUp, fetchFollowUps, fetchNotes, fetchOverview, NOTE_TEMPLATES, openPatientRecord, requestPatientLink, saveFollowUp, saveNote } from './service'

const DAY = 86_400_000
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null)

type StatusFilter = 'todos' | 'recentes' | 'sem' | 'pendentes'
const STATUS_OPTIONS = [
  { value: 'todos', label: 'Todos' }, { value: 'recentes', label: 'Com registros recentes (7 dias)' },
  { value: 'sem', label: 'Sem registros recentes' }, { value: 'pendentes', label: 'Aguardando autorização' },
]

export function ProfessionalDashboardPage() {
  const q = useQuery({ queryKey: ['overview'], queryFn: fetchOverview })
  const fu = useQuery({ queryKey: ['followups'], queryFn: fetchFollowUps })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('todos')
  const all = q.data ?? []
  const returns = useMemo(() => new Map((fu.data ?? []).map((f) => [f.patient_id, f])), [fu.data])
  const today = todayLocal()
  const rows = useMemo(() => all.filter((r) => {
    if (!r.full_name.toLowerCase().includes(search.trim().toLowerCase())) return false
    const d = daysSince(r.last_record_at)
    if (status === 'pendentes') return r.link_status === 'pending'
    if (status === 'recentes') return r.link_status === 'active' && (d ?? 999) <= 7
    if (status === 'sem') return r.link_status === 'active' && (d ?? 999) > 7
    return true
  }), [all, search, status])
  if (q.isLoading) return <Spinner />
  if (q.error) return <Alert tone="bad">{friendlyError(q.error)}</Alert>
  const active = all.filter((r) => r.link_status === 'active')
  const stale14 = active.filter((r) => (daysSince(r.last_record_at) ?? 999) > 14)
  const attacks30 = active.reduce((n, r) => n + (r.attacks_30d ?? 0), 0)
  const soon = (fu.data ?? []).filter((f) => f.next_return >= today && f.next_return <= addDays(today, 7))
  const exportCsv = () => downloadText(`pacientes_${today}.csv`, toCsv(rows, [
    { header: 'Paciente', value: (r) => r.full_name }, { header: 'Situação do vínculo', value: (r) => (r.link_status === 'active' ? 'Ativo' : 'Aguardando autorização') },
    { header: 'Última atualização', value: (r) => r.last_record_at?.slice(0, 10) ?? '' }, { header: 'Crises (30 dias)', value: (r) => r.attacks_30d ?? '' },
    { header: 'Ciclo menstrual compartilhado', value: (r) => (r.include_menstruation ? 'Sim' : 'Não') }, { header: 'Retorno planejado', value: (r) => returns.get(r.patient_id)?.next_return ?? '' },
  ]))
  return (
    <div className="space-y-4">
      <PageTitle action={<Link className="text-sm text-brand" to="/profissional/demo">Ver paciente de demonstração</Link>}>Pacientes</PageTitle>
      {!all.length ? <Onboarding /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Pacientes ativos" value={active.length} />
            <Stat label="Sem registro há mais de 14 dias" value={stale14.length} />
            <Stat label="Crises nos últimos 30 dias" value={attacks30} />
            <Stat label="Retornos nos próximos 7 dias" value={soon.length} />
          </div>
          {soon.length > 0 && (
            <Card title="Retornos próximos">
              <ul className="space-y-1 text-sm">{soon.map((f) => (
                <li key={f.id}><strong>{fmtDate(f.next_return)}</strong> · <Link className="text-brand" to={`/profissional/pacientes/${f.patient_id}`}>{all.find((r) => r.patient_id === f.patient_id)?.full_name || 'Paciente'}</Link>{f.reason ? ` · ${f.reason}` : ''}</li>
              ))}</ul>
            </Card>
          )}
          <Card title="Lista de pacientes" action={<Button small variant="secondary" disabled={!rows.length} onClick={exportCsv}>Exportar CSV</Button>}>
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <Field label="Buscar paciente"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome" /></Field>
              <Field label="Situação"><Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} options={STATUS_OPTIONS} /></Field>
            </div>
            <Table empty="Nenhum paciente nesta situação." head={['Paciente', 'Última atualização', 'Crises (30 dias)', 'Retorno', 'Alertas informativos', '']}
              rows={rows.map((r) => {
                const d = daysSince(r.last_record_at)
                const pend = r.link_status === 'pending'
                return [
                  <strong>{r.full_name || 'Sem nome'}</strong>,
                  pend ? <Badge tone="warn">Aguardando autorização</Badge> : r.last_record_at ? `${fmtInstant(r.last_record_at)} (há ${d} dia${d === 1 ? '' : 's'})` : 'Sem registros',
                  pend ? '—' : r.attacks_30d ?? '—',
                  returns.get(r.patient_id) ? fmtDate(returns.get(r.patient_id)!.next_return) : '—',
                  <span className="flex flex-wrap gap-1">
                    {!pend && (d === null ? <Badge tone="info">Ainda sem registros</Badge> : d > 14 ? <Badge tone="warn">Sem registros há mais de 14 dias</Badge> : null)}
                    {(r.attacks_30d ?? 0) >= 8 && <Badge tone="warn">8 ou mais crises em 30 dias</Badge>}
                    {!pend && !r.include_menstruation && <Badge>Ciclo menstrual não compartilhado</Badge>}
                  </span>,
                  pend ? '' : <Link to={`/profissional/pacientes/${r.patient_id}`}><Button small>Abrir</Button></Link>,
                ]
              })} />
          </Card>
        </>
      )}
      <InviteCard />
      <p className="text-xs text-muted">Você só vê pacientes que autorizaram o compartilhamento. Cada abertura de prontuário e cada exportação ficam registradas e visíveis para o paciente. Os alertas são apenas informativos, baseados em regras simples de volume de registros; não constituem avaliação clínica nem recomendação terapêutica.</p>
    </div>
  )
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl border border-line bg-card p-3"><p className="text-2xl font-bold text-brand">{value}</p><p className="text-xs text-muted">{label}</p></div>
)

/** Tela inicial quando ainda não há pacientes: o que fazer em seguida. */
function Onboarding() {
  return (
    <Card title="Bem-vindo ao painel do profissional">
      <p className="mb-3 text-sm text-muted">Você ainda não tem pacientes vinculados. O paciente é quem decide compartilhar o diário com você. Veja como começar:</p>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li><strong>Convide o paciente</strong> pelo e-mail dele, no cartão abaixo. Ou peça que ele o adicione em <em>Minha conta → Compartilhar com profissional</em>, usando o seu e-mail.</li>
        <li><strong>O paciente autoriza</strong> o vínculo, dá o consentimento de compartilhamento e escolhe se compartilha o ciclo menstrual.</li>
        <li><strong>Pronto:</strong> ele aparece nesta lista e você abre o prontuário (cada abertura é registrada).</li>
      </ol>
      <p className="mt-3 text-sm">Quer conhecer as telas antes? <Link className="font-medium text-brand" to="/profissional/demo">Abrir o paciente de demonstração</Link> (dados fictícios, nada é gravado).</p>
    </Card>
  )
}

/** O profissional pede o vínculo pelo e-mail do paciente; o paciente precisa aceitar. */
function InviteCard() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const act = useAction()
  return (
    <Card title="Convidar paciente">
      <p className="mb-3 text-sm text-muted">Informe o e-mail que o paciente usa no aplicativo. Se houver conta, ele verá o pedido em <em>Minha conta</em> e decide se autoriza. Por privacidade, esta tela não informa se o e-mail tem conta.</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1"><Field label="E-mail do paciente" error={act.fields.email}><Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSent(false) }} /></Field></div>
        <Button disabled={act.busy || !email} onClick={() => act.run(() => requestPatientLink(email), () => { setSent(true); setEmail('') })}>Enviar pedido</Button>
      </div>
      {act.error && !act.fields.email && <div className="mt-2"><Alert tone="bad">{act.error}</Alert></div>}
      {sent && <div className="mt-2"><Alert tone="good">Pedido registrado. Se o e-mail tiver conta de paciente, o pedido aparecerá para ele. Avise-o por fora, pois o app ainda não envia e-mail.</Alert></div>}
    </Card>
  )
}

const TABS = [
  ['resumo', 'Resumo'], ['calendario', 'Calendário'], ['crises', 'Crises'], ['medicamentos', 'Medicamentos'], ['resposta', 'Resposta terapêutica'],
  ['menstruacao', 'Menstruação'], ['habitos', 'Hábitos'], ['evolucao', 'Evolução'], ['relatorios', 'Relatórios'], ['observacoes', 'Observações clínicas'],
].map(([value, label]) => ({ value, label }))

export function PatientRecordPage() {
  const { id = '' } = useParams()
  // A abertura registra o acesso no servidor; a RLS só libera a leitura depois disso.
  const open = useQuery({ queryKey: ['open-record', id], queryFn: () => openPatientRecord(id), staleTime: 60 * 60_000, retry: false })
  const overview = useQuery({ queryKey: ['overview'], queryFn: fetchOverview, enabled: open.isSuccess })
  if (open.isLoading || overview.isLoading) return <Spinner label="Abrindo prontuário…" />
  if (open.error) return <div className="space-y-3"><Alert tone="bad">{friendlyError(open.error)}</Alert><Link className="text-brand" to="/profissional">← Voltar</Link></div>
  const row = overview.data?.find((r) => r.patient_id === id)
  return (
    <PatientScopeProvider value={{ patientId: id, patientName: row?.full_name ?? '', readOnly: true, menstruationVisible: !!row?.include_menstruation }}>
      <RecordTabs />
    </PatientScopeProvider>
  )
}

function RecordTabs() {
  const scope = usePatientScope()
  const [tab, setTab] = useState('resumo')
  const state = usePeriod('90')
  const ev = useEvolution(state.period)
  const usesPeriod = !['calendario', 'relatorios', 'observacoes'].includes(tab)
  const r = ev.result
  const inPeriod = (d: string) => d >= state.period.from && d <= state.period.to
  return (
    <div className="space-y-4">
      <PageTitle action={<Link className="text-sm text-brand" to="/profissional">← Pacientes</Link>}>{scope.patientName || 'Paciente'}</PageTitle>
      <p className="text-xs text-muted">Visão somente leitura · registros autorrelatados pelo paciente · este acesso foi registrado.</p>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {usesPeriod && <PeriodPicker state={state} />}
      {usesPeriod && (ev.isLoading ? <Spinner /> : ev.error ? <Alert tone="bad">{friendlyError(ev.error)}</Alert> : null)}
      {tab === 'resumo' && r && <><FollowUpCard /><DeclaredInfo /><EvolutionView r={r} sections="summary" /></>}
      {tab === 'calendario' && <CalendarView />}
      {tab === 'crises' && r && (
        <AttackList attacks={r.dataset.attacks.filter((a) => inPeriod(dateOf(a.started_at)))} administrations={r.dataset.administrations} empty="Nenhuma crise registrada neste período." />
      )}
      {tab === 'medicamentos' && r && <MedicationsTab administrations={r.dataset.administrations.filter((m) => inPeriod(dateOf(m.taken_at)))} />}
      {tab === 'resposta' && r && <><ResponseCard c={r.current} /><IntensityCard c={r.current} /></>}
      {tab === 'menstruacao' && r && (
        <Card title="Cefaleia e período menstrual">
          {!scope.menstruationVisible ? <Empty>O paciente não autorizou o compartilhamento do ciclo menstrual.</Empty>
            : r.current.menstrual ? <MenstrualAnalysisView analysis={r.current.menstrual} /> : <Empty>Sem registros de ciclo menstrual neste período.</Empty>}
        </Card>
      )}
      {tab === 'habitos' && r && <><HabitsCard c={r.current} /><TriggersCard c={r.current} /></>}
      {tab === 'evolucao' && r && <EvolutionView r={r} />}
      {tab === 'relatorios' && <ReportPanel />}
      {tab === 'observacoes' && <NotesPanel />}
    </div>
  )
}

/** Data de retorno planejada (visível ao paciente). Só quem atua como profissional edita. */
function FollowUpCard() {
  const { patientId } = usePatientScope()
  const me = useProfile()
  const q = useQuery({ queryKey: ['followups'], queryFn: fetchFollowUps })
  const cur = q.data?.find((f) => f.patient_id === patientId)
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const act = useAction()
  if (!(me.role === 'professional' || (me.role === 'admin' && me.clinical_enabled))) return null
  return (
    <Card title="Retorno">
      {cur && <p className="mb-2 text-sm">Retorno planejado: <strong>{fmtDate(cur.next_return)}</strong>{cur.reason ? ` · ${cur.reason}` : ''}</p>}
      <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <Field label="Data do retorno" error={act.fields.next_return}><Input type="date" min={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Motivo (opcional)" error={act.fields.reason}><Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
        <Button disabled={act.busy || !date} onClick={() => act.run(() => saveFollowUp(patientId, me.id, date, reason), () => { setDate(''); setReason('') })}>{cur ? 'Atualizar' : 'Salvar'}</Button>
      </div>
      {act.error && !act.fields.next_return && !act.fields.reason && <div className="mt-2"><Alert tone="bad">{act.error}</Alert></div>}
      {cur && <Button className="mt-2" small variant="ghost" disabled={act.busy} onClick={() => act.run(() => clearFollowUp(cur.id))}>Remover retorno</Button>}
      <p className="mt-2 text-xs text-muted">O paciente consegue ver esta data. Não use este campo para conduta clínica.</p>
    </Card>
  )
}

function DeclaredInfo() {
  const { patientId } = usePatientScope()
  const q = useQuery({ queryKey: ['patient', patientId], queryFn: () => fetchPatient(patientId) })
  const p = q.data
  if (!p) return null
  const rows: [string, string | null][] = [
    ['Nascimento', p.birth_date ? fmtDate(p.birth_date) : null], ['Início das dores', p.pain_onset_approx], ['Frequência habitual informada', p.usual_frequency],
    ['Diagnóstico informado pelo paciente', p.reported_diagnosis], ['Histórico relevante', p.clinical_history], ['Outras condições', p.comorbidities], ['Uso contínuo', p.continuous_medications],
  ]
  return (
    <Card title="Informações declaradas pelo paciente">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">{rows.map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="whitespace-pre-wrap">{v || '—'}</dd></div>)}</dl>
    </Card>
  )
}

function MedicationsTab({ administrations }: { administrations: import('@/types/database').Administration[] }) {
  const { patientId } = usePatientScope()
  const prev = useQuery({ queryKey: ['preventives', patientId], queryFn: () => fetchPreventives(patientId) })
  return (
    <>
      <Card title="Tratamentos preventivos (informados pelo paciente)">{prev.isLoading ? <Spinner /> : <PreventiveList items={prev.data ?? []} />}</Card>
      <Card title="Administrações de medicamentos para crise">
        <Table empty="Nenhuma administração neste período." head={['Data e horário', 'Medicamento', 'Dose', 'Via', 'Intens. antes', 'Desfecho', 'Recorrência', 'Efeito adverso']}
          rows={[...administrations].reverse().map((m) => [
            `${fmtDateTime(m.taken_at)}${m.time_is_approximate ? ' (aprox.)' : ''}`, m.medication_name, m.dose !== null ? `${m.dose} ${m.unit ?? ''}` : '—', m.route ? labelOf('route', m.route) : '—',
            m.intensity_before ?? '—', m.outcome ? labelOf('outcome', m.outcome) : '—', m.recurred === null ? '—' : m.recurred ? 'Sim' : 'Não', m.adverse_effect ? m.adverse_effect_note || 'Sim' : '—',
          ])} />
      </Card>
    </>
  )
}

/** Observações clínicas: autoria profissional, separadas do autorrelato. O paciente pode lê-las. */
function NotesPanel() {
  const { patientId } = usePatientScope()
  const me = useProfile()
  const q = useQuery({ queryKey: ['notes', patientId], queryFn: () => fetchNotes(patientId) })
  const [kind, setKind] = useState<ClinicalNote['kind']>('observation')
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const act = useAction()
  const canWrite = me.role === 'professional' || (me.role === 'admin' && me.clinical_enabled)
  const reset = () => { setContent(''); setEditing(null); setKind('observation') }
  return (
    <div className="space-y-4">
      {canWrite ? (
        <Card title={editing ? 'Editar observação' : 'Nova observação clínica'}>
          <div className="space-y-3">
            <Field label="Tipo"><Select value={kind} onChange={(e) => setKind(e.target.value as ClinicalNote['kind'])}
              options={[{ value: 'observation', label: 'Observação clínica' }, { value: 'diagnosis', label: 'Diagnóstico informado pelo profissional' }]} /></Field>
            {!editing && <Field label="Modelo de estrutura" hint="Insere apenas títulos em branco para você preencher."><Select value="" onChange={(e) => { const t = NOTE_TEMPLATES.find((x) => x.value === e.target.value); if (t && t.text) setContent((c) => (c.trim() ? `${c}\n\n${t.text}` : t.text)) }} options={NOTE_TEMPLATES.map((t) => ({ value: t.value, label: t.label }))} /></Field>}
            <Field label="Conteúdo" hint="Fica identificado com seu nome e data. O paciente pode ler este registro." error={act.fields.content}>
              <Textarea rows={5} value={content} maxLength={6000} onChange={(e) => setContent(e.target.value)} /></Field>
            {act.error && !act.fields.content && <Alert tone="bad">{act.error}</Alert>}
            <div className="flex gap-2"><Button disabled={act.busy} onClick={() => act.run(() => saveNote(patientId, me.id, { kind, content }, editing ?? undefined), reset)}>Salvar</Button>
              {editing && <Button variant="ghost" onClick={reset}>Cancelar</Button>}</div>
          </div>
        </Card>
      ) : <Alert tone="info">Somente profissionais de saúde registram observações clínicas.</Alert>}
      <Card title="Observações registradas">
        {q.isLoading ? <Spinner /> : !q.data?.length ? <Empty>Nenhuma observação registrada.</Empty> : (
          <ul className="space-y-2 text-sm">
            {q.data.map((n) => (
              <li key={n.id} className="rounded-lg bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted">{fmtInstant(n.created_at)}{n.updated_at !== n.created_at && ` (editada em ${fmtInstant(n.updated_at)})`} · {n.author_name ?? 'Profissional'} · <Badge tone="info">{n.kind === 'diagnosis' ? 'Diagnóstico informado pelo profissional' : 'Observação'}</Badge></p>
                  {canWrite && n.author_id === me.id && <Button small variant="ghost" onClick={() => { setEditing(n.id); setKind(n.kind); setContent(n.content) }}>Editar</Button>}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{n.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/** Paciente de DEMONSTRAÇÃO: dados fictícios gerados no navegador; nada é gravado nem lido do banco. */
export function DemoPatientPage() {
  const settings = useSettings()
  const state = usePeriod('90')
  const [tab, setTab] = useState('resumo')
  const ds = useMemo(() => buildDemoDataset(), [])
  const r = useMemo(() => buildEvolution(ds, state.period, settings, todayLocal()), [ds, state.period, settings])
  const inPeriod = (d: string) => d >= state.period.from && d <= state.period.to
  const tabs = TABS.filter((t) => ['resumo', 'crises', 'medicamentos', 'resposta', 'habitos', 'evolucao'].includes(t.value))
  return (
    <PatientScopeProvider value={{ patientId: 'demo', patientName: DEMO_NAME, readOnly: true, menstruationVisible: false }}>
      <div className="space-y-4">
        <PageTitle action={<Link className="text-sm text-brand" to="/profissional">← Pacientes</Link>}>{DEMO_NAME}</PageTitle>
        <Alert tone="warn">DEMONSTRAÇÃO: todos os dados abaixo são fictícios, gerados no seu navegador. Nada é salvo e nenhum paciente real é acessado. Calendário, menstruação, relatórios e observações aparecem só em pacientes reais.</Alert>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        <PeriodPicker state={state} />
        {tab === 'resumo' && <EvolutionView r={r} sections="summary" />}
        {tab === 'crises' && <AttackList attacks={r.dataset.attacks.filter((a) => inPeriod(dateOf(a.started_at)))} administrations={r.dataset.administrations} empty="Nenhuma crise neste período." />}
        {tab === 'medicamentos' && (
          <Card title="Administrações de medicamentos para crise (fictícias)">
            <Table empty="Nenhuma administração neste período." head={['Data e horário', 'Medicamento', 'Desfecho', 'Recorrência']}
              rows={[...r.dataset.administrations].filter((m) => inPeriod(dateOf(m.taken_at))).reverse().map((m) => [fmtDateTime(m.taken_at), m.medication_name, m.outcome ? labelOf('outcome', m.outcome) : '—', m.recurred ? 'Sim' : 'Não'])} />
          </Card>
        )}
        {tab === 'resposta' && <><ResponseCard c={r.current} /><IntensityCard c={r.current} /></>}
        {tab === 'habitos' && <><HabitsCard c={r.current} /><TriggersCard c={r.current} /></>}
        {tab === 'evolucao' && <EvolutionView r={r} />}
      </div>
    </PatientScopeProvider>
  )
}
