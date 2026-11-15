import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Empty, Field, Input, PageTitle, Select, Spinner, Table, Tabs, Textarea } from '@/components/ui'
import { PeriodPicker, usePeriod } from '@/components/PeriodPicker'
import { labelOf } from '@/config/clinical-options'
import { useAction } from '@/hooks/useDraft'
import type { ClinicalNote } from '@/types/database'
import { dateOf, fmtDate, fmtDateTime, fmtInstant } from '@/utils/datetime'
import { friendlyError } from '@/utils/errors'
import { useProfile } from '@/modules/authentication/AuthProvider'
import { CalendarView } from '@/modules/calendar/CalendarView'
import { EvolutionView, HabitsCard, IntensityCard, ResponseCard, TriggersCard } from '@/modules/clinical-evolution/EvolutionView'
import { useEvolution } from '@/modules/clinical-evolution/useEvolution'
import { AttackList } from '@/modules/headache-attacks/AttackList'
import { PreventiveList } from '@/modules/medications/MedicationsPage'
import { fetchPreventives } from '@/modules/medications/service'
import { MenstrualAnalysisView } from '@/modules/menstruation/MenstrualAnalysisView'
import { PatientScopeProvider, usePatientScope } from '@/modules/patients/scope'
import { fetchPatient } from '@/modules/patients/service'
import { ReportPanel } from '@/modules/reports/ReportPanel'
import { fetchNotes, fetchOverview, openPatientRecord, saveNote, type OverviewRow } from './service'

const DAY = 86_400_000
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null)

export function ProfessionalDashboardPage() {
  const q = useQuery({ queryKey: ['overview'], queryFn: fetchOverview })
  const [search, setSearch] = useState('')
  const rows = useMemo(() => (q.data ?? []).filter((r) => r.full_name.toLowerCase().includes(search.trim().toLowerCase())), [q.data, search])
  if (q.isLoading) return <Spinner />
  if (q.error) return <Alert tone="bad">{friendlyError(q.error)}</Alert>
  const active = rows.filter((r) => r.link_status === 'active')
  const recent = active.filter((r) => (daysSince(r.last_record_at) ?? 999) <= 7)
  const stale = active.filter((r) => (daysSince(r.last_record_at) ?? 999) > 7)
  const pending = rows.filter((r) => r.link_status === 'pending')
  const table = (list: OverviewRow[]) => (
    <Table empty="Nenhum paciente nesta situação." head={['Paciente', 'Última atualização', 'Crises (30 dias)', 'Alertas informativos', '']}
      rows={list.map((r) => {
        const d = daysSince(r.last_record_at)
        return [
          <strong>{r.full_name || 'Sem nome'}</strong>,
          r.last_record_at ? `${fmtInstant(r.last_record_at)} (há ${d} dia${d === 1 ? '' : 's'})` : 'Sem registros',
          r.attacks_30d ?? '—',
          <span className="flex flex-wrap gap-1">
            {d === null ? <Badge tone="info">Ainda sem registros</Badge> : d > 14 ? <Badge tone="warn">Sem registros há mais de 14 dias</Badge> : null}
            {(r.attacks_30d ?? 0) >= 8 && <Badge tone="warn">8 ou mais crises em 30 dias</Badge>}
            {!r.include_menstruation && <Badge>Ciclo menstrual não compartilhado</Badge>}
          </span>,
          <Link to={`/profissional/pacientes/${r.patient_id}`}><Button small>Abrir</Button></Link>,
        ]
      })} />
  )
  return (
    <div className="space-y-4">
      <PageTitle>Pacientes vinculados</PageTitle>
      <Alert tone="info">Você só vê pacientes que autorizaram o compartilhamento. Cada abertura de prontuário e cada exportação ficam registradas e visíveis para o paciente.</Alert>
      <Field label="Buscar paciente"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome" /></Field>
      <Card title={`Com registros recentes (${recent.length})`}>{table(recent)}</Card>
      <Card title={`Sem registros recentes (${stale.length})`}>{table(stale)}</Card>
      {pending.length > 0 && (
        <Card title={`Aguardando autorização do paciente (${pending.length})`}>
          <ul className="text-sm text-muted">{pending.map((p) => <li key={p.patient_id}>{p.full_name || 'Paciente'}</li>)}</ul>
        </Card>
      )}
      <p className="text-xs text-muted">Os alertas são apenas informativos, baseados em regras simples de volume de registros. Não constituem avaliação clínica nem recomendação terapêutica.</p>
    </div>
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
      {tab === 'resumo' && r && <><DeclaredInfo /><EvolutionView r={r} sections="summary" /></>}
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
  const canWrite = me.role === 'professional'
  const reset = () => { setContent(''); setEditing(null); setKind('observation') }
  return (
    <div className="space-y-4">
      {canWrite ? (
        <Card title={editing ? 'Editar observação' : 'Nova observação clínica'}>
          <div className="space-y-3">
            <Field label="Tipo"><Select value={kind} onChange={(e) => setKind(e.target.value as ClinicalNote['kind'])}
              options={[{ value: 'observation', label: 'Observação clínica' }, { value: 'diagnosis', label: 'Diagnóstico informado pelo profissional' }]} /></Field>
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
