import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Checkbox, Empty, Field, Input, PageTitle, Select, Spinner, Table, Textarea } from '@/components/ui'
import { CONSENT_ORDER, CONSENT_TEXT } from '@/config/consents'
import { useAction, useDraft } from '@/hooks/useDraft'
import { blank } from '@/services/crud'
import type { ConsentType, Patient } from '@/types/database'
import { downloadText } from '@/utils/csv'
import { fmtInstant, todayLocal } from '@/utils/datetime'
import { useAuth, useProfile } from '@/modules/authentication/AuthProvider'
import { REQUIRED_CONSENTS } from '@/modules/authentication/access'
import { password as passwordRule } from '@/modules/authentication/schemas'
import { fetchConsents, fetchPublicConfig, recordConsents, updatePassword } from '@/modules/authentication/service'
import { fetchNotes } from '@/modules/professional-dashboard/service'
import { ProfessionalCard } from '@/modules/professional-dashboard/ProfessionalCard'
import {
  exportAllMyData, fetchAccessToMe, fetchMyDeletionRequests, fetchMyLinks, fetchPatient, requestDeletion, shareWithProfessional, updateLink, updateName, updatePatient,
} from './service'

const ACTION_LABEL: Record<string, string> = { open_record: 'Abriu seus registros', export_pdf: 'Gerou relatório em PDF', export_csv: 'Exportou dados em CSV', overview: 'Visão geral' }

export function ProfilePage() {
  const me = useProfile()
  const isPatient = me.role === 'patient'
  return (
    <div className="space-y-4">
      <PageTitle>{isPatient ? 'Meu perfil' : 'Minha conta'}</PageTitle>
      <AccountCard />
      {(me.role === 'professional' || (me.role === 'admin' && me.clinical_enabled)) && <ProfessionalCard />}
      {isPatient && <PatientDataCard />}
      <ConsentsCard />
      {isPatient && <SharingCard />}
      {isPatient && <ProfessionalNotesCard />}
      <SecurityCard />
      {isPatient && <MyDataCard />}
    </div>
  )
}

function AccountCard() {
  const me = useProfile()
  const { refresh } = useAuth()
  const [name, setName] = useState(me.full_name)
  const act = useAction()
  return (
    <Card title="Conta">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome completo" error={act.fields.full_name}><Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="E-mail" hint="O e-mail de acesso não pode ser alterado por aqui."><Input value={me.email} disabled /></Field>
      </div>
      {act.error && !act.fields.full_name && <Alert tone="bad">{act.error}</Alert>}
      <Button className="mt-3" small disabled={act.busy || name.trim() === me.full_name} onClick={() => act.run(() => updateName(me.id, name), refresh)}>Salvar nome</Button>
    </Card>
  )
}

function PatientDataCard() {
  const me = useProfile()
  const q = useQuery({ queryKey: ['patient', me.id], queryFn: () => fetchPatient(me.id) })
  if (q.isLoading) return <Spinner />
  if (!q.data) return <Alert tone="bad">Não foi possível carregar seus dados.</Alert>
  return <PatientForm patient={q.data} />
}

function PatientForm({ patient }: { patient: Patient }) {
  const zones = useMemo(() => {
    try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone') } catch { return ['America/Manaus', 'America/Sao_Paulo', 'America/Boa_Vista', 'UTC'] }
  }, [])
  const { v, set } = useDraft({
    birth_date: patient.birth_date ?? '', phone: patient.phone ?? '', sex_at_birth: patient.sex_at_birth ?? '', gender: patient.gender ?? '', country: patient.country ?? '',
    city: patient.city ?? '', timezone: patient.timezone, pain_onset_approx: patient.pain_onset_approx ?? '', usual_frequency: patient.usual_frequency ?? '',
    reported_diagnosis: patient.reported_diagnosis ?? '', clinical_history: patient.clinical_history ?? '', comorbidities: patient.comorbidities ?? '', continuous_medications: patient.continuous_medications ?? '',
  })
  const act = useAction()
  const [ok, setOk] = useState(false)
  const save = () => act.run(() => updatePatient(patient.id, {
    ...Object.fromEntries(Object.entries(v).map(([k, val]) => [k, blank(val)])), timezone: v.timezone, birth_date: v.birth_date || null, sex_at_birth: v.sex_at_birth || null,
  }), () => setOk(true))
  const t = (k: keyof typeof v, label: string, max: number, hint?: string) => (
    <Field label={label} hint={hint} error={act.fields[k]}><Input value={v[k]} maxLength={max} onChange={(e) => set(k, e.target.value)} /></Field>
  )
  return (
    <Card title="Meus dados (opcionais)">
      <p className="mb-3 text-xs text-muted">Nenhum campo é obrigatório. Estas informações são declaradas por você; observações de profissionais ficam registradas separadamente.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Data de nascimento" error={act.fields.birth_date}><Input type="date" max={todayLocal()} value={v.birth_date} onChange={(e) => set('birth_date', e.target.value)} /></Field>
        {t('phone', 'Telefone', 40)}
        <Field label="Sexo registrado ao nascimento" hint="Usado apenas para contextualizar o acompanhamento clínico (ex.: módulo menstrual).">
          <Select placeholder="Prefiro não informar" value={v.sex_at_birth} onChange={(e) => set('sex_at_birth', e.target.value)}
            options={[{ value: 'female', label: 'Feminino' }, { value: 'male', label: 'Masculino' }, { value: 'intersex', label: 'Intersexo' }]} />
        </Field>
        {t('gender', 'Gênero', 80)}
        {t('country', 'País', 80)}
        {t('city', 'Cidade', 120)}
        <Field label="Fuso horário"><Select options={zones.map((z) => ({ value: z, label: z }))} value={v.timezone} onChange={(e) => set('timezone', e.target.value)} /></Field>
        {t('pain_onset_approx', 'Quando as dores começaram (aproximado)', 120, 'ex.: adolescência, há 5 anos')}
        {t('usual_frequency', 'Frequência habitual das dores', 200, 'se souber')}
        {t('reported_diagnosis', 'Diagnóstico que você recebeu de um profissional', 500, 'se houver')}
      </div>
      <div className="mt-3 space-y-3">
        <Field label="Histórico clínico relevante"><Textarea value={v.clinical_history} maxLength={4000} onChange={(e) => set('clinical_history', e.target.value)} /></Field>
        <Field label="Outras condições de saúde"><Textarea value={v.comorbidities} maxLength={2000} onChange={(e) => set('comorbidities', e.target.value)} /></Field>
        <Field label="Medicamentos de uso contínuo" hint="Tratamentos preventivos para cefaleia são registrados em Medicamentos."><Textarea value={v.continuous_medications} maxLength={2000} onChange={(e) => set('continuous_medications', e.target.value)} /></Field>
        {act.error && <Alert tone="bad">{act.error}</Alert>}
        {ok && !act.error && <Alert tone="good">Dados salvos.</Alert>}
        <Button disabled={act.busy} onClick={save}>Salvar meus dados</Button>
      </div>
    </Card>
  )
}

function ConsentsCard() {
  const me = useProfile()
  const { consents, refresh } = useAuth()
  const cfg = useQuery({ queryKey: ['public-config'], queryFn: fetchPublicConfig })
  const history = useQuery({ queryKey: ['consents', me.id], queryFn: () => fetchConsents(me.id) })
  const act = useAction()
  const required = REQUIRED_CONSENTS[me.role]
  const list = me.role === 'patient' ? CONSENT_ORDER : required
  const toggle = (c: ConsentType, granted: boolean) => {
    if (!cfg.data) return
    if (!granted && required.includes(c) && !confirm('Este consentimento é necessário para usar o diário. Ao revogá-lo, você não conseguirá registrar novos dados até concedê-lo novamente. Continuar?')) return
    void act.run(() => recordConsents(me.id, { [c]: granted }, cfg.data!.consent_versions), refresh)
  }
  return (
    <Card title="Consentimentos">
      <div className="space-y-3">
        {list.map((c) => {
          const last = [...(history.data ?? [])].reverse().find((h) => h.consent_type === c)
          return (
            <div key={c}>
              <Checkbox checked={!!consents[c]} disabled={act.busy} onChange={(x) => toggle(c, x)}
                label={<><strong>{CONSENT_TEXT[c].title}</strong> {required.includes(c) ? <Badge tone="info">necessário</Badge> : <Badge>opcional</Badge>}<br /><span className="text-muted">{CONSENT_TEXT[c].summary}</span></>} />
              {last && <p className="ml-6 text-xs text-muted">{last.granted ? 'Concedido' : 'Revogado'} em {fmtInstant(last.created_at)} · versão {last.version}</p>}
            </div>
          )
        })}
        {act.error && <Alert tone="bad">{act.error}</Alert>}
        <p className="text-xs text-muted">Cada decisão fica registrada com data e versão do termo. O consentimento para pesquisa nunca é condição para usar o diário.</p>
      </div>
    </Card>
  )
}

function SharingCard() {
  const me = useProfile()
  const { consents } = useAuth()
  const links = useQuery({ queryKey: ['links', me.id], queryFn: () => fetchMyLinks(me.id) })
  const access = useQuery({ queryKey: ['access-to-me', me.id], queryFn: () => fetchAccessToMe(me.id) })
  const patient = useQuery({ queryKey: ['patient', me.id], queryFn: () => fetchPatient(me.id) })
  const [email, setEmail] = useState('')
  const [menstruation, setMenstruation] = useState(false)
  const act = useAction()
  const nameOf = (id: string) => links.data?.find((l) => l.grantee_id === id)?.grantee?.full_name || 'Usuário autorizado'
  return (
    <Card title="Compartilhamento com profissionais">
      <div className="space-y-4">
        {!consents.professional_sharing && <Alert tone="warn">O consentimento de compartilhamento está desativado. Enquanto estiver assim, nenhum profissional consegue ver seus registros, mesmo com vínculo ativo.</Alert>}
        {links.isLoading ? <Spinner /> : !links.data?.length ? <Empty>Você ainda não compartilha seu diário com ninguém.</Empty> : (
          <ul className="divide-y divide-line">
            {links.data.map((l) => (
              <li key={l.id} className="space-y-2 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><strong>{l.grantee?.full_name || l.grantee?.email || 'Profissional'}</strong> {l.grantee?.role === 'admin' && <Badge>administrador</Badge>}{' '}
                    <Badge tone={l.status === 'active' ? 'good' : l.status === 'pending' ? 'warn' : 'neutral'}>{l.status === 'active' ? 'Autorizado' : l.status === 'pending' ? 'Aguardando sua autorização' : 'Revogado'}</Badge></span>
                  <span className="flex gap-2">
                    {l.status !== 'active' && <Button small disabled={act.busy} onClick={() => act.run(() => updateLink(l.id, { status: 'active' }))}>Autorizar</Button>}
                    {l.status !== 'revoked' && <Button small variant="secondary" disabled={act.busy} onClick={() => act.run(() => updateLink(l.id, { status: 'revoked' }))}>{l.status === 'pending' ? 'Recusar' : 'Revogar'}</Button>}
                  </span>
                </div>
                {l.status === 'active' && patient.data?.tracks_menstruation && (
                  <Checkbox label="Permitir que veja também meu ciclo menstrual" checked={l.include_menstruation} disabled={act.busy} onChange={(x) => act.run(() => updateLink(l.id, { include_menstruation: x }))} />
                )}
              </li>
            ))}
          </ul>
        )}
        <fieldset className="space-y-2 rounded-lg bg-surface p-3">
          <legend className="px-1 text-sm font-semibold">Compartilhar com um profissional</legend>
          <Field label="E-mail do profissional cadastrado" error={act.fields.email}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {patient.data?.tracks_menstruation && <Checkbox label="Incluir meu ciclo menstrual" checked={menstruation} onChange={setMenstruation} />}
          <Button small disabled={act.busy || !email.includes('@') || !consents.professional_sharing} onClick={() => act.run(() => shareWithProfessional(me.id, email, menstruation), () => setEmail(''))}>Compartilhar</Button>
        </fieldset>
        {act.error && !act.fields.email && <Alert tone="bad">{act.error}</Alert>}
        <div>
          <p className="mb-1 text-sm font-semibold">Quem acessou meus dados</p>
          <Table empty="Nenhum acesso de terceiros registrado." head={['Quando', 'Quem', 'O que fez']}
            rows={(access.data ?? []).map((a) => [fmtInstant(a.created_at), nameOf(a.actor_id), ACTION_LABEL[a.action] ?? a.action])} />
        </div>
      </div>
    </Card>
  )
}

function ProfessionalNotesCard() {
  const me = useProfile()
  const q = useQuery({ queryKey: ['notes', me.id], queryFn: () => fetchNotes(me.id) })
  if (!q.data?.length) return null
  return (
    <Card title="Observações registradas por profissionais">
      <ul className="space-y-2 text-sm">
        {q.data.map((n) => (
          <li key={n.id} className="rounded-lg bg-surface p-3">
            <p className="text-xs text-muted">{fmtInstant(n.created_at)} · {n.author_name ?? 'Profissional'} · {n.kind === 'diagnosis' ? 'Diagnóstico informado pelo profissional' : 'Observação'}</p>
            <p className="whitespace-pre-wrap">{n.content}</p>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function SecurityCard() {
  const { signOut } = useAuth()
  const [pw, setPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [msg, setMsg] = useState('')
  const act = useAction()
  const change = () => {
    const r = passwordRule.safeParse(pw)
    if (!r.success) return setMsg(r.error.issues[0].message)
    if (pw !== confirmPw) return setMsg('As senhas não conferem.')
    setMsg('')
    void act.run(() => updatePassword(pw), () => { setPw(''); setConfirmPw(''); setMsg('Senha alterada.') })
  }
  return (
    <Card title="Segurança e sessões">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nova senha" hint="Mínimo de 10 caracteres, com letra e número."><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Confirmar nova senha"><Input type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} /></Field>
      </div>
      {(msg || act.error) && <div className="mt-2"><Alert tone={msg === 'Senha alterada.' ? 'good' : 'bad'}>{act.error || msg}</Alert></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button small disabled={act.busy || !pw} onClick={change}>Alterar senha</Button>
        <Button small variant="secondary" onClick={() => signOut()}>Sair deste dispositivo</Button>
        <Button small variant="secondary" onClick={() => confirm('Encerrar a sessão em todos os dispositivos?') && signOut(true)}>Sair de todos os dispositivos</Button>
      </div>
    </Card>
  )
}

function MyDataCard() {
  const me = useProfile()
  const requests = useQuery({ queryKey: ['deletion', me.id], queryFn: () => fetchMyDeletionRequests(me.id) })
  const [reason, setReason] = useState('')
  const act = useAction()
  const pending = requests.data?.find((r) => r.status === 'pending' || r.status === 'processing')
  const exportAll = () => act.run(async () => {
    const data = await exportAllMyData(me.id)
    downloadText(`diario-cefaleia_meus-dados_${todayLocal()}.json`, JSON.stringify(data, null, 2), 'application/json')
  })
  return (
    <Card title="Meus dados e privacidade">
      <div className="space-y-3 text-sm">
        <p className="text-muted">Você pode levar uma cópia completa dos seus dados ou solicitar a exclusão da conta. Exportações por período (PDF/CSV) ficam em Relatórios.</p>
        <Button small variant="secondary" disabled={act.busy} onClick={exportAll}>Exportar todos os meus dados (JSON)</Button>
        <hr className="border-line" />
        <p className="font-semibold">Excluir conta e dados</p>
        {pending ? <Alert tone="info">Solicitação registrada em {fmtInstant(pending.requested_at)}. A equipe da CENDOR dará retorno.</Alert> : (
          <>
            <p className="text-muted">A solicitação é analisada pela CENDOR. Alguns registros podem precisar ser mantidos pelo prazo exigido em lei; nesse caso você será informado.</p>
            <Field label="Motivo (opcional)"><Textarea value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} /></Field>
            <Button small variant="danger" disabled={act.busy} onClick={() => confirm('Confirmar a solicitação de exclusão da conta e dos dados?') && act.run(() => requestDeletion(me.id, reason))}>Solicitar exclusão</Button>
          </>
        )}
        {requests.data?.filter((r) => r.status === 'done' || r.status === 'rejected').map((r) => (
          <p key={r.id} className="text-xs text-muted">Solicitação de {fmtInstant(r.requested_at)}: {r.status === 'done' ? 'concluída' : 'não atendida'}{r.admin_note ? ` — ${r.admin_note}` : ''}</p>
        ))}
        {act.error && <Alert tone="bad">{act.error}</Alert>}
      </div>
    </Card>
  )
}
