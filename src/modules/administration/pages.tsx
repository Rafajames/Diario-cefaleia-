import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Field, Input, PageTitle, Select, Spinner, Stat, Table, Textarea } from '@/components/ui'
import { MED_CATEGORIES, labelOf } from '@/config/clinical-options'
import { useAction } from '@/hooks/useDraft'
import type { ConsentType, Medication, Profile } from '@/types/database'
import { downloadText, toCsv } from '@/utils/csv'
import { fmtInstant, todayLocal } from '@/utils/datetime'
import { friendlyError } from '@/utils/errors'
import { useProfile } from '@/modules/authentication/AuthProvider'
import { MedicationModal } from '@/modules/medications/MedicationsPage'
import {
  createInvite, createPendingLink, fetchAccessLogs, fetchAggregate, fetchAllConsents, fetchAuditMeta, fetchCatalog, fetchDeletionRequests, fetchInvites, fetchLinks,
  fetchProfiles, fetchSettingRows, fetchStats, revokeInvite, revokeLink, saveSetting, setCatalogActive, setRole, setStatus, updateDeletionRequest, type SettingRow,
} from './service'
import { parseSetting } from './settings-schema'

const ROLE: Record<string, string> = { patient: 'Paciente', professional: 'Profissional', admin: 'Administrador', reception: 'Recepção' }
const useProfilesMap = () => {
  const q = useQuery({ queryKey: ['admin-profiles'], queryFn: fetchProfiles })
  const map = useMemo(() => new Map((q.data ?? []).map((p) => [p.id, p])), [q.data])
  const name = (id: string | null) => (id ? map.get(id)?.full_name || map.get(id)?.email || id.slice(0, 8) : '—')
  return { ...q, map, name }
}

export function AdminDashboardPage() {
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: fetchStats })
  const agg = useQuery({ queryKey: ['admin-aggregate'], queryFn: fetchAggregate })
  if (stats.isLoading) return <Spinner />
  if (stats.error || !stats.data) return <Alert tone="bad">{friendlyError(stats.error)}</Alert>
  const s = stats.data
  const a = agg.data
  const exportStats = () => downloadText(`diario-cefaleia_estatisticas_${todayLocal()}.csv`,
    toCsv([...Object.entries(s), ...Object.entries(a ?? {}).map(([k, v]) => [`agregado_${k}`, v] as [string, unknown])], [{ header: 'indicador', value: (r) => r[0] }, { header: 'valor', value: (r) => String(r[1] ?? '') }]))
  return (
    <div className="space-y-4">
      <PageTitle action={<Button small variant="secondary" onClick={exportStats}>Exportar estatísticas (CSV)</Button>}>Painel administrativo</PageTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total de usuários" value={s.total_users} sub={`${s.suspended} suspenso(s)`} />
        <Stat label="Pacientes" value={s.patients} sub={`${s.active_patients_30d} ativo(s) em 30 dias`} />
        <Stat label="Profissionais" value={s.professionals} />
        <Stat label="Novos cadastros (30 dias)" value={s.new_signups_30d} />
        <Stat label="Registros realizados" value={s.records_total} sub={`${s.attacks_total} crise(s)`} />
        <Stat label="Relatórios gerados" value={s.reports_generated} />
        <Stat label="Vínculos ativos" value={s.active_links} />
        <Stat label="Pedidos de exclusão pendentes" value={s.pending_deletions} />
      </div>
      <Card title="Relatório geral anonimizado (últimos 90 dias)">
        {agg.isLoading ? <Spinner /> : !a ? <Alert tone="bad">{friendlyError(agg.error)}</Alert> : a.insufficient ? (
          <Alert tone="info">Indisponível: são necessários ao menos {String(a.minimum_group)} pacientes com consentimento de pesquisa (há {String(a.consenting_patients)}). O limite evita a reidentificação de pessoas em grupos pequenos.</Alert>
        ) : (
          <Table head={['Indicador', 'Valor']} rows={[
            ['Pacientes com consentimento de pesquisa', String(a.consenting_patients)], ['Pacientes com crises no período', String(a.patients_with_attacks)], ['Crises registradas', String(a.attacks)],
            ['Intensidade máxima média', String(a.mean_max_intensity ?? '—')], ['Duração mediana (horas)', String(a.median_duration_hours ?? '—')], ['Administrações de medicação para crise', String(a.acute_medication_administrations)],
          ]} />
        )}
        <p className="mt-2 text-xs text-muted">Somente dados agregados de pacientes que consentiram com o uso em estatísticas e pesquisa. Nenhuma informação clínica identificável é exibida aqui.</p>
      </Card>
      <p className="text-xs text-muted">Atualizado em {fmtInstant(s.generated_at)}. O administrador não acessa dados clínicos individuais sem autorização expressa do paciente.</p>
      <DeletionRequestsCard />
    </div>
  )
}

function DeletionRequestsCard() {
  const me = useProfile()
  const q = useQuery({ queryKey: ['admin-deletions'], queryFn: fetchDeletionRequests })
  const people = useProfilesMap()
  const [note, setNote] = useState<Record<string, string>>({})
  const act = useAction()
  const open = (q.data ?? []).filter((r) => r.status === 'pending' || r.status === 'processing')
  if (!open.length) return null
  return (
    <Card title="Solicitações de exclusão de conta e dados">
      <p className="mb-2 text-xs text-muted">Siga o procedimento de docs/LGPD.md: verifique obrigações legais de retenção antes de eliminar. A eliminação efetiva é feita diretamente no banco (função app.purge_patient), nunca por esta tela.</p>
      <ul className="space-y-3">
        {open.map((r) => (
          <li key={r.id} className="rounded-lg bg-surface p-3 text-sm">
            <p><strong>{people.name(r.user_id)}</strong> · solicitado em {fmtInstant(r.requested_at)} · <Badge tone="warn">{r.status === 'pending' ? 'Pendente' : 'Em processamento'}</Badge></p>
            {r.reason && <p className="text-muted">Motivo: {r.reason}</p>}
            <Field label="Nota ao titular"><Input value={note[r.id] ?? ''} maxLength={1000} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} /></Field>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button small variant="secondary" disabled={act.busy} onClick={() => act.run(() => updateDeletionRequest(r.id, 'processing', note[r.id] ?? '', me.id))}>Marcar em processamento</Button>
              <Button small disabled={act.busy} onClick={() => act.run(() => updateDeletionRequest(r.id, 'done', note[r.id] ?? '', me.id))}>Registrar como concluída</Button>
              <Button small variant="ghost" disabled={act.busy} onClick={() => act.run(() => updateDeletionRequest(r.id, 'rejected', note[r.id] ?? '', me.id))}>Não atender (justificar na nota)</Button>
            </div>
          </li>
        ))}
      </ul>
      {act.error && <Alert tone="bad">{act.error}</Alert>}
    </Card>
  )
}

export function AdminUsersPage() {
  const me = useProfile()
  const q = useProfilesMap()
  const consents = useQuery({ queryKey: ['admin-consents'], queryFn: fetchAllConsents })
  const [role, setRoleFilter] = useState('')
  const [search, setSearch] = useState('')
  const act = useAction()
  const current = useMemo(() => {
    const m = new Map<string, Partial<Record<ConsentType, boolean>>>()
    for (const c of consents.data ?? []) m.set(c.user_id, { ...(m.get(c.user_id) ?? {}), [c.consent_type]: c.granted })
    return m
  }, [consents.data])
  if (q.isLoading) return <Spinner />
  if (q.error) return <Alert tone="bad">{friendlyError(q.error)}</Alert>
  const term = search.trim().toLowerCase()
  const list = (q.data ?? []).filter((p) => (!role || p.role === role) && (!term || p.full_name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term)))
  const mark = (p: Profile, c: ConsentType, label: string) => <Badge key={c} tone={current.get(p.id)?.[c] ? 'good' : 'neutral'}>{label}{current.get(p.id)?.[c] ? ' ✓' : ' ✕'}</Badge>
  return (
    <div className="space-y-4">
      <PageTitle>Usuários</PageTitle>
      <div className="flex flex-wrap gap-3">
        <Field label="Buscar"><Input value={search} placeholder="Nome ou e-mail" onChange={(e) => setSearch(e.target.value)} /></Field>
        <Field label="Perfil"><Select placeholder="Todos" value={role} onChange={(e) => setRoleFilter(e.target.value)} options={Object.entries(ROLE).map(([value, label]) => ({ value, label }))} /></Field>
      </div>
      {act.error && <Alert tone="bad">{act.error}</Alert>}
      <Card>
        <Table empty="Nenhum usuário encontrado." head={['Nome', 'E-mail', 'Perfil', 'Situação', 'Autorizações vigentes', 'Cadastro', 'Ações']}
          rows={list.map((p) => [
            <strong>{p.full_name || '—'}</strong>, p.email, ROLE[p.role],
            <Badge tone={p.status === 'active' ? 'good' : 'bad'}>{p.status === 'active' ? 'Ativa' : 'Suspensa'}</Badge>,
            <span className="flex flex-wrap gap-1">{mark(p, 'personal_data', 'Dados')}{p.role === 'patient' && <>{mark(p, 'health_data', 'Saúde')}{mark(p, 'professional_sharing', 'Compart.')}{mark(p, 'research', 'Pesquisa')}</>}</span>,
            fmtInstant(p.created_at),
            p.id === me.id ? <span className="text-xs text-muted">Sua conta</span> : p.role === 'admin' ? <span className="text-xs text-muted">Gerenciado no banco</span> : (
              <span className="flex flex-wrap gap-1">
                <Button small variant="secondary" disabled={act.busy} onClick={() => confirm(p.status === 'active' ? `Suspender ${p.email}?` : `Reativar ${p.email}?`) && act.run(() => setStatus(p.id, p.status === 'active' ? 'suspended' : 'active'))}>
                  {p.status === 'active' ? 'Suspender' : 'Reativar'}</Button>
                <Select aria-label={`Perfil de ${p.email}`} value={p.role} disabled={act.busy}
                  onChange={(e) => { const r = e.target.value as 'patient' | 'professional' | 'reception'; if (r !== p.role && confirm(`Alterar o perfil de ${p.email} para ${ROLE[r]}?`)) act.run(() => setRole(p.id, r)) }}
                  options={[{ value: 'patient', label: 'Paciente' }, { value: 'professional', label: 'Profissional' }, { value: 'reception', label: 'Recepção' }]} />
              </span>
            ),
          ])} />
      </Card>
      <p className="text-xs text-muted">O perfil de administrador não pode ser concedido ou removido por esta tela — o provisionamento é feito diretamente no banco, conforme docs/SECURITY.md. As autorizações mostram apenas se cada consentimento está vigente.</p>
    </div>
  )
}

export function AdminLinksPage() {
  const people = useProfilesMap()
  const links = useQuery({ queryKey: ['admin-links'], queryFn: fetchLinks })
  const [patient, setPatient] = useState('')
  const [grantee, setGrantee] = useState('')
  const act = useAction()
  const patients = (people.data ?? []).filter((p) => p.role === 'patient' && p.status === 'active')
  const grantees = (people.data ?? []).filter((p) => (p.role === 'professional' || (p.role === 'admin' && p.clinical_enabled)) && p.status === 'active')
  const opt = (p: Profile) => ({ value: p.id, label: `${p.full_name || p.email}${p.role === 'admin' ? ' (administrador)' : ''}` })
  return (
    <div className="space-y-4">
      <PageTitle>Vínculos e permissões</PageTitle>
      <Card title="Propor vínculo">
        <p className="mb-3 text-sm text-muted">O vínculo criado aqui fica <strong>pendente</strong>. Somente o paciente pode autorizá-lo, no próprio perfil. O administrador pode revogar vínculos, mas nunca ativá-los.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Paciente"><Select placeholder="Selecione" value={patient} onChange={(e) => setPatient(e.target.value)} options={patients.map(opt)} /></Field>
          <Field label="Profissional"><Select placeholder="Selecione" value={grantee} onChange={(e) => setGrantee(e.target.value)} options={grantees.map(opt)} /></Field>
          <Button disabled={act.busy || !patient || !grantee} onClick={() => act.run(() => createPendingLink(patient, grantee), () => { setPatient(''); setGrantee('') })}>Propor</Button>
        </div>
        {act.error && <div className="mt-2"><Alert tone="bad">{act.error}</Alert></div>}
      </Card>
      <Card title="Vínculos">
        {links.isLoading ? <Spinner /> : (
          <Table empty="Nenhum vínculo." head={['Paciente', 'Profissional', 'Situação', 'Ciclo menstrual', 'Criado em', 'Autorizado em', '']}
            rows={(links.data ?? []).map((l) => [
              people.name(l.patient_id), people.name(l.grantee_id),
              <Badge tone={l.status === 'active' ? 'good' : l.status === 'pending' ? 'warn' : 'neutral'}>{l.status === 'active' ? 'Ativo' : l.status === 'pending' ? 'Pendente' : 'Revogado'}</Badge>,
              l.include_menstruation ? 'Compartilhado' : 'Não compartilhado', fmtInstant(l.created_at), fmtInstant(l.authorized_at),
              l.status !== 'revoked' ? <Button small variant="ghost" disabled={act.busy} onClick={() => confirm('Revogar este vínculo?') && act.run(() => revokeLink(l.id))}>Revogar</Button> : null,
            ])} />
        )}
      </Card>
    </div>
  )
}

export function AdminInvitesPage() {
  const me = useProfile()
  const q = useQuery({ queryKey: ['admin-invites'], queryFn: fetchInvites })
  const [email, setEmail] = useState('')
  const [role, setRoleValue] = useState<'patient' | 'professional' | 'reception'>('patient')
  const [copied, setCopied] = useState(false)
  const act = useAction()
  const link = `${window.location.origin}/cadastro`
  const state = (i: { accepted_at: string | null; revoked_at: string | null; expires_at: string }) =>
    i.accepted_at ? <Badge tone="good">Aceito</Badge> : i.revoked_at ? <Badge>Revogado</Badge> : new Date(i.expires_at) < new Date() ? <Badge>Expirado</Badge> : <Badge tone="warn">Aguardando cadastro</Badge>
  return (
    <div className="space-y-4">
      <PageTitle>Convites</PageTitle>
      <Card title="Novo convite">
        <p className="mb-3 text-sm text-muted">O convite libera o cadastro para este e-mail (mesmo com o cadastro público desativado) e define o perfil da conta. É assim que profissionais são cadastrados. Válido por 14 dias.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <Field label="E-mail" error={act.fields.email}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Perfil"><Select value={role} onChange={(e) => setRoleValue(e.target.value as 'patient' | 'professional' | 'reception')} options={[{ value: 'patient', label: 'Paciente' }, { value: 'professional', label: 'Profissional de saúde' }, { value: 'reception', label: 'Recepção' }]} /></Field>
          <Button disabled={act.busy || !email} onClick={() => act.run(() => createInvite(email, role, me.id), () => setEmail(''))}>Convidar</Button>
        </div>
        {act.error && !act.fields.email && <div className="mt-2"><Alert tone="bad">{act.error}</Alert></div>}
        <div className="mt-3 rounded-lg bg-surface p-3 text-sm">
          <p>O envio automático de e-mail ainda não está configurado. Envie este endereço à pessoa convidada, que deve se cadastrar com o mesmo e-mail do convite:</p>
          <p className="mt-1 flex flex-wrap items-center gap-2"><code className="rounded bg-card px-2 py-1">{link}</code>
            <Button small variant="secondary" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}>{copied ? 'Copiado' : 'Copiar'}</Button></p>
        </div>
      </Card>
      <Card title="Convites emitidos">
        {q.isLoading ? <Spinner /> : (
          <Table empty="Nenhum convite." head={['E-mail', 'Perfil', 'Situação', 'Criado em', 'Expira em', '']}
            rows={(q.data ?? []).map((i) => [i.email, ROLE[i.role], state(i), fmtInstant(i.created_at), fmtInstant(i.expires_at),
              !i.accepted_at && !i.revoked_at ? <Button small variant="ghost" disabled={act.busy} onClick={() => act.run(() => revokeInvite(i.id))}>Revogar</Button> : null])} />
        )}
      </Card>
    </div>
  )
}

export function AdminSettingsPage() {
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: fetchSettingRows })
  if (q.isLoading) return <Spinner />
  if (q.error) return <Alert tone="bad">{friendlyError(q.error)}</Alert>
  return (
    <div className="space-y-4">
      <PageTitle>Parâmetros gerais</PageTitle>
      <Alert tone="warn">Os parâmetros clínicos (faixas de intensidade, janela menstrual, regras de evolução e sinalização de uso frequente de medicação) devem ser definidos e revisados pelo responsável médico. Toda alteração fica no histórico de auditoria.</Alert>
      {(q.data ?? []).map((row) => <SettingEditor key={`${row.key}:${row.updated_at}`} row={row} />)}
    </div>
  )
}

function SettingEditor({ row }: { row: SettingRow }) {
  const me = useProfile()
  const [text, setText] = useState(JSON.stringify(row.value, null, 2))
  const [local, setLocal] = useState('')
  const act = useAction()
  const isBool = typeof row.value === 'boolean'
  const save = (json: string) => {
    const r = parseSetting(row.key, json)
    if (!r.ok) return setLocal(r.error)
    setLocal('')
    void act.run(() => saveSetting(row.key, r.value, me.id))
  }
  return (
    <Card title={<code className="text-sm">{row.key}</code>}>
      <p className="mb-2 text-sm text-muted">{row.description}</p>
      {isBool ? (
        <div className="flex items-center gap-3"><Badge tone={row.value ? 'good' : 'neutral'}>{row.value ? 'Ativado' : 'Desativado'}</Badge>
          <Button small variant="secondary" disabled={act.busy} onClick={() => save(JSON.stringify(!row.value))}>{row.value ? 'Desativar' : 'Ativar'}</Button></div>
      ) : (
        <>
          <Textarea rows={Math.min(12, text.split('\n').length + 1)} className="font-mono text-xs" value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} />
          <Button className="mt-2" small disabled={act.busy} onClick={() => save(text)}>Validar e salvar</Button>
        </>
      )}
      {(local || act.error) && <div className="mt-2"><Alert tone="bad">{local || act.error}</Alert></div>}
      <p className="mt-2 text-xs text-muted">Última alteração: {fmtInstant(row.updated_at)}</p>
    </Card>
  )
}

const ACTION: Record<string, string> = { open_record: 'Abertura de prontuário', overview: 'Visão geral de pacientes', export_pdf: 'Relatório PDF', export_csv: 'Exportação CSV', export_own_data: 'Exportação dos próprios dados' }

export function AdminAuditPage() {
  const people = useProfilesMap()
  const access = useQuery({ queryKey: ['admin-access'], queryFn: fetchAccessLogs })
  const audit = useQuery({ queryKey: ['admin-audit'], queryFn: fetchAuditMeta })
  return (
    <div className="space-y-4">
      <PageTitle>Auditoria</PageTitle>
      <Card title="Acessos a dados clínicos (200 mais recentes)">
        {access.isLoading ? <Spinner /> : access.error ? <Alert tone="bad">{friendlyError(access.error)}</Alert> : (
          <Table empty="Nenhum acesso registrado." head={['Quando', 'Quem', 'Ação', 'Paciente', 'Detalhe']}
            rows={(access.data ?? []).map((l) => [fmtInstant(l.created_at), people.name(l.actor_id), ACTION[l.action] ?? l.action, people.name(l.patient_id), l.detail ?? ''])} />
        )}
      </Card>
      <Card title="Histórico de alterações — metadados (200 mais recentes)">
        {audit.isLoading ? <Spinner /> : audit.error ? <Alert tone="bad">{friendlyError(audit.error)}</Alert> : (
          <Table empty="Nenhuma alteração registrada." head={['Quando', 'Tabela', 'Operação', 'Autor', 'Titular dos dados']}
            rows={(audit.data ?? []).map((l) => [fmtInstant(l.created_at), l.table_name, l.action, l.actor_id ? people.name(l.actor_id) : 'Sistema', people.name(l.patient_id)])} />
        )}
        <p className="mt-2 text-xs text-muted">O conteúdo clínico das alterações não é exibido ao administrador; apenas o titular dos dados consegue consultá-lo.</p>
      </Card>
    </div>
  )
}

export function AdminCatalogPage() {
  const q = useQuery({ queryKey: ['admin-catalog'], queryFn: fetchCatalog })
  const [editing, setEditing] = useState<Medication | 'new' | null>(null)
  const act = useAction()
  return (
    <div className="space-y-4">
      <PageTitle action={<Button onClick={() => setEditing('new')}>+ Adicionar ao catálogo</Button>}>Catálogo de medicamentos</PageTitle>
      <Alert tone="info">O catálogo serve apenas para padronizar nomes e classes nos registros. A plataforma não recomenda medicamentos nem doses. As categorias são usadas nos relatórios por classe.</Alert>
      {act.error && <Alert tone="bad">{act.error}</Alert>}
      <Card title={`Categorias: ${MED_CATEGORIES.map((c) => c.label).join(' · ')}`}>
        {q.isLoading ? <Spinner /> : (
          <Table empty="Catálogo vazio. Os pacientes ainda podem cadastrar seus próprios medicamentos." head={['Nome', 'Princípio ativo', 'Categoria', 'Apresentação', 'Dosagem', 'Situação', '']}
            rows={(q.data ?? []).map((m) => [
              <strong>{m.trade_name}</strong>, m.active_ingredient ?? '—', labelOf('medCategory', m.category), m.presentation ?? '—', m.strength !== null ? `${m.strength} ${m.unit ?? ''}` : '—',
              <Badge tone={m.active ? 'good' : 'neutral'}>{m.active ? 'Ativo' : 'Inativo'}</Badge>,
              <span className="flex gap-1"><Button small variant="ghost" onClick={() => setEditing(m)}>Editar</Button>
                <Button small variant="ghost" disabled={act.busy} onClick={() => act.run(() => setCatalogActive(m.id, !m.active))}>{m.active ? 'Desativar' : 'Reativar'}</Button></span>,
            ])} />
        )}
      </Card>
      {editing && <MedicationModal ownerId={null} allowPreventive med={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
