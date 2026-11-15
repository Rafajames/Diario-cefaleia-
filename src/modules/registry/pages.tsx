import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Field, Input, PageTitle, Select, Spinner, Table } from '@/components/ui'
import { useAction } from '@/hooks/useDraft'
import { fmtDate } from '@/utils/datetime'
import { friendlyError } from '@/utils/errors'
import { useProfile } from '@/modules/authentication/AuthProvider'

/** Administração e recepção usam as mesmas telas, em caminhos diferentes. */
const useBase = () => (useProfile().role === 'reception' ? '/recepcao' : '/admin/cadastros')
import { RegistryForm } from './RegistryForm'
import { registryClaim, registryList, STATUS_LABEL, type Registry } from './service'

const STATUS_OPTIONS = [{ value: 'incomplete', label: 'Incompleto' }, { value: 'complete', label: 'Completo' }, { value: 'awaiting_documents', label: 'Aguardando documentos' }, { value: 'inactive', label: 'Inativo' }]

/** Administração: busca e lista de cadastros. O CPF aparece mascarado; a busca aceita nome, prontuário ou CPF completo. */
export function AdminRegistryListPage() {
  const base = useBase()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const q = useQuery({ queryKey: ['registry-list', search, status], queryFn: () => registryList(search, status) })
  return (
    <div className="space-y-4">
      <PageTitle action={<Link to={`${base}/novo`}><Button small>Novo cadastro</Button></Link>}>Cadastros de pacientes</PageTitle>
      <Alert tone="info">Cadastros podem ser criados antes de o paciente ter conta e ficam incompletos até os dados obrigatórios serem preenchidos. Abrir um cadastro de paciente fica registrado.</Alert>
      <Card>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Field label="Buscar" hint="Nome, número de prontuário ou CPF completo."><Input value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
          <Field label="Situação cadastral"><Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todas" options={STATUS_OPTIONS} /></Field>
        </div>
        {q.isLoading ? <Spinner /> : q.error ? <Alert tone="bad">{friendlyError(q.error)}</Alert> : (
          <Table empty="Nenhum cadastro encontrado." head={['Prontuário', 'Paciente', 'CPF', 'Nascimento', 'Situação', 'Conta', 'Médico responsável', '']}
            rows={(q.data ?? []).map((r) => [
              r.record_number, <strong>{r.full_name || 'Sem nome'}</strong>, r.cpf_masked ?? '—', r.birth_date ? fmtDate(r.birth_date) : '—',
              <Badge tone={r.registration_status === 'complete' ? 'good' : r.registration_status === 'inactive' ? 'neutral' : 'warn'}>{STATUS_LABEL[r.registration_status]}</Badge>,
              r.linked ? 'Vinculada' : 'Sem conta', r.responsible_name ?? '—',
              <Link to={`${base}/${r.id}`}><Button small>Abrir</Button></Link>,
            ])} />
        )}
      </Card>
    </div>
  )
}

export function AdminRegistryEditPage() {
  const base = useBase()
  const { id = '' } = useParams()
  const nav = useNavigate()
  const isNew = id === 'novo'
  return (
    <div className="space-y-4">
      <PageTitle action={<Link className="text-sm text-brand" to={base}>← Cadastros</Link>}>{isNew ? 'Novo cadastro' : 'Cadastro do paciente'}</PageTitle>
      <RegistryForm key={id} mode="admin" registryId={isNew ? null : id} onCreated={(newId) => nav(`${base}/${newId}`, { replace: true })} />
    </div>
  )
}

/** Paciente: o próprio cadastro, e a ativação de um cadastro feito pela equipe. */
export function MyRegistryPage() {
  const me = useProfile()
  return (
    <div className="space-y-4">
      <PageTitle>Meu cadastro</PageTitle>
      <p className="text-sm text-muted">Preencha o que souber. Você pode salvar um cadastro incompleto e voltar depois. Pedimos apenas os dados necessários ao seu atendimento.</p>
      <ClaimCard />
      <RegistryForm mode="owner" userId={me.id} />
    </div>
  )
}

function ClaimCard() {
  const [open, setOpen] = useState(false)
  const [record, setRecord] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const act = useAction()
  if (!open) return <p className="text-sm">A CENDOR já cadastrou você? <button type="button" className="text-brand underline" onClick={() => setOpen(true)}>Use seu código de ativação</button></p>
  return (
    <Card title="Ativar cadastro feito pela CENDOR">
      <p className="mb-3 text-sm text-muted">Informe o número do prontuário e o código que a CENDOR entregou a você. Se sua conta já tiver um cadastro com CPF, procure a CENDOR.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Número do prontuário"><Input value={record} placeholder="CEF-000123" onChange={(e) => setRecord(e.target.value.toUpperCase())} /></Field>
        <Field label="Código de ativação"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field>
      </div>
      <Button className="mt-3" disabled={act.busy || !record || !code} onClick={() => act.run(async () => {
        const ok = await registryClaim(record, code)
        setMsg(ok ? { tone: 'good', text: 'Cadastro vinculado à sua conta.' } : { tone: 'bad', text: 'Código inválido, expirado ou com tentativas esgotadas. Peça um novo código à CENDOR.' })
        if (ok) { setRecord(''); setCode('') }
      })}>Ativar</Button>
      {act.error && <div className="mt-2"><Alert tone="bad">{act.error}</Alert></div>}
      {msg && <div className="mt-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
    </Card>
  )
}

export type { Registry }
