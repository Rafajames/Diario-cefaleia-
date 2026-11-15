import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Empty, Field, Input, Select, Spinner, Table, Tabs, Textarea } from '@/components/ui'
import { useAction } from '@/hooks/useDraft'
import { fmtInstant, todayLocal } from '@/utils/datetime'
import { friendlyError } from '@/utils/errors'
import { ConsentsCard } from '@/modules/patients/ProfilePage'
import { formatCep, formatCpf, isAdult } from './cpf'
import {
  fetchResponsibleOptions, registryGenerateCode, registryGet, registryHistory, registrySave, STATUS_LABEL, type Registry,
} from './service'

type Mode = 'admin' | 'owner' | 'view'
interface FieldDef { key: string; label: string; kind?: 'text' | 'date' | 'select' | 'textarea' | 'email' | 'cpf' | 'cep' | 'tel' | 'number'; hint?: string; admin?: boolean; options?: { value: string; label: string }[]; wide?: boolean }

const SEX = [{ value: 'female', label: 'Feminino' }, { value: 'male', label: 'Masculino' }, { value: 'intersex', label: 'Intersexo' }, { value: 'undisclosed', label: 'Prefere não informar' }]
const MARITAL = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Separado(a)', 'Divorciado(a)', 'Viúvo(a)'].map((v) => ({ value: v, label: v }))

const TAB_FIELDS: Record<string, FieldDef[]> = {
  identificacao: [
    { key: 'full_name', label: 'Nome completo' }, { key: 'social_name', label: 'Nome social' },
    { key: 'cpf', label: 'CPF', kind: 'cpf', hint: 'Obrigatório para concluir o cadastro.' }, { key: 'rg_number', label: 'RG ou CIN' },
    { key: 'birth_date', label: 'Data de nascimento', kind: 'date' }, { key: 'sex_at_birth', label: 'Sexo registrado ao nascimento', kind: 'select', options: SEX },
    { key: 'nationality', label: 'Nacionalidade' }, { key: 'marital_status', label: 'Estado civil (opcional)', kind: 'select', options: MARITAL },
  ],
  contato: [
    { key: 'phone_mobile', label: 'Telefone celular', kind: 'tel' }, { key: 'whatsapp', label: 'WhatsApp', kind: 'tel' }, { key: 'phone_alt', label: 'Telefone alternativo', kind: 'tel' },
    { key: 'email_primary', label: 'E-mail principal', kind: 'email' }, { key: 'email_secondary', label: 'E-mail secundário (opcional)', kind: 'email' },
  ],
  endereco: [
    { key: 'cep', label: 'CEP', kind: 'cep' }, { key: 'street', label: 'Rua/avenida' }, { key: 'address_number', label: 'Número' }, { key: 'address_complement', label: 'Complemento' },
    { key: 'district', label: 'Bairro' }, { key: 'city', label: 'Cidade' }, { key: 'state', label: 'Estado' }, { key: 'country', label: 'País' },
  ],
  administrativo: [
    { key: 'first_consultation', label: 'Data da primeira consulta', kind: 'date', admin: true }, { key: 'responsible_professional_id', label: 'Médico responsável', kind: 'select', admin: true },
    { key: 'insurance_name', label: 'Convênio médico (se houver)' }, { key: 'insurance_number', label: 'Número da carteirinha' },
    { key: 'cns', label: 'Cartão Nacional de Saúde (CNS)', hint: '15 dígitos, quando necessário.' },
  ],
  responsaveis: [
    { key: 'emergency_name', label: 'Contato de emergência — nome completo' }, { key: 'emergency_relationship', label: 'Grau de parentesco' },
    { key: 'emergency_phone', label: 'Telefone', kind: 'tel' }, { key: 'emergency_phone_alt', label: 'Telefone alternativo', kind: 'tel' },
  ],
  guardian: [
    { key: 'guardian_name', label: 'Responsável legal — nome completo' }, { key: 'guardian_cpf', label: 'CPF do responsável', kind: 'cpf' }, { key: 'guardian_rg', label: 'RG do responsável' },
    { key: 'guardian_relationship', label: 'Parentesco' }, { key: 'guardian_phone', label: 'Telefone', kind: 'tel' }, { key: 'guardian_email', label: 'E-mail', kind: 'email' },
  ],
  clinico: [
    { key: 'allergies', label: 'Alergias', kind: 'textarea' }, { key: 'adverse_reactions', label: 'Reações adversas a medicamentos', kind: 'textarea' },
    { key: 'surgeries', label: 'Cirurgias anteriores', kind: 'textarea' }, { key: 'hospitalizations', label: 'Histórico de internações', kind: 'textarea' },
    { key: 'family_history', label: 'Histórico familiar relevante', kind: 'textarea' }, { key: 'weight_kg', label: 'Peso (kg)', kind: 'number' }, { key: 'height_cm', label: 'Altura (cm)', kind: 'number' },
    { key: 'clinical_notes', label: 'Observações clínicas', kind: 'textarea' },
  ],
}
const ALL_KEYS = Object.values(TAB_FIELDS).flat().map((f) => f.key)
const TABS = [
  ['identificacao', '1. Identificação'], ['documentos', '2. Documentos'], ['contato', '3. Contato'], ['endereco', '4. Endereço'],
  ['administrativo', '5. Administrativo'], ['responsaveis', '6. Responsáveis e emergência'], ['clinico', '7. Histórico clínico'], ['consentimentos', '8. Consentimentos'],
].map(([value, label]) => ({ value, label }))

const asText = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** Cadastro principal do paciente em abas. Aceita rascunho; salva só o que mudou. */
export function RegistryForm({ registryId, userId, mode, onCreated }: { registryId?: string | null; userId?: string; mode: Mode; onCreated?: (id: string) => void }) {
  const today = todayLocal()
  const isNew = mode === 'admin' && !registryId && !userId
  const q = useQuery({ queryKey: ['registry', registryId ?? userId], queryFn: () => registryGet({ registry: registryId, user: userId }), enabled: !isNew, retry: false })
  const options = useQuery({ queryKey: ['responsible-options'], queryFn: fetchResponsibleOptions, enabled: mode === 'admin' })
  const [tab, setTab] = useState('identificacao')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loadedId, setLoadedId] = useState('')
  const act = useAction()
  const [code, setCode] = useState('')

  const reg: Registry | null = q.data?.registry ?? null
  useEffect(() => {
    if (!reg || reg.id === loadedId) return
    setDraft(Object.fromEntries(ALL_KEYS.concat(['registration_status']).map((k) => [k, asText(reg[k])])))
    setLoadedId(reg.id)
  }, [reg, loadedId])
  useEffect(() => { if (isNew) setDraft({}) }, [isNew])

  const readOnly = mode === 'view' || (!isNew && q.data?.access !== undefined && !['owner', 'admin'].includes(q.data.access))
  const minor = !isAdult(draft.birth_date, today)
  const changes = useMemo(() => {
    const out: Record<string, string> = {}
    for (const k of ALL_KEYS.concat(isNew ? [] : ['registration_status'])) {
      const now = draft[k] ?? ''
      if (k === 'registration_status' && !['auto', 'inactive', 'awaiting_documents'].includes(now)) continue
      if (now !== asText(reg?.[k])) out[k] = now
    }
    return out
  }, [draft, reg, isNew])
  const dirty = Object.keys(changes).length > 0
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }))

  if (!isNew && q.isLoading) return <Spinner />
  if (!isNew && q.error) return <Alert tone="bad">{friendlyError(q.error)}</Alert>
  const view = q.data
  const isAdminUser = mode === 'admin'
  const missing = view?.missing ?? []

  const renderField = (f: FieldDef) => {
    const disabled = readOnly || (f.admin && !isAdminUser)
    const value = draft[f.key] ?? ''
    let control
    if (f.kind === 'select') {
      const opts = f.key === 'responsible_professional_id'
        ? (options.data ?? []).map((o) => ({ value: o.id, label: o.full_name || o.email }))
        : f.options ?? []
      control = <Select value={value} disabled={disabled} placeholder="—" onChange={(e) => set(f.key, e.target.value)} options={opts} />
    } else if (f.kind === 'textarea') {
      control = <Textarea rows={3} value={value} disabled={disabled} maxLength={2000} onChange={(e) => set(f.key, e.target.value)} />
    } else {
      const fmt = f.kind === 'cpf' ? formatCpf : f.kind === 'cep' ? formatCep : (s: string) => s
      control = <Input value={value} disabled={disabled} type={f.kind === 'date' ? 'date' : f.kind === 'email' ? 'email' : 'text'} inputMode={f.kind === 'number' ? 'decimal' : f.kind === 'tel' ? 'tel' : undefined}
        max={f.kind === 'date' ? today : undefined} maxLength={f.kind === 'number' ? 6 : 200} onChange={(e) => set(f.key, fmt(e.target.value))} />
    }
    return <Field key={f.key} label={f.label} hint={f.hint} error={act.fields[f.key]} className={f.kind === 'textarea' ? 'sm:col-span-2' : undefined}>{control}</Field>
  }
  const grid = (fields: FieldDef[]) => <div className="grid gap-3 sm:grid-cols-2">{fields.map(renderField)}</div>

  const save = () => act.run(async () => {
    const res = await registrySave(isNew ? null : reg!.id, changes, today)
    if (isNew) onCreated?.(res.id)
  })

  return (
    <div className="space-y-4">
      {!isNew && view && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <strong>Prontuário {reg!.record_number}</strong>
            <Badge tone={reg!.registration_status === 'complete' ? 'good' : reg!.registration_status === 'inactive' ? 'neutral' : 'warn'}>{STATUS_LABEL[reg!.registration_status]}</Badge>
            <Badge tone={view.linked ? 'good' : 'info'}>{view.linked ? 'Conta vinculada' : 'Sem conta ainda'}</Badge>
          </div>
          {missing.length > 0 && <p className="mt-2 text-sm text-muted">Para concluir o cadastro falta: {missing.join(', ')}. Você pode salvar assim e continuar depois.</p>}
        </Card>
      )}
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'identificacao' && <Card title="Identificação pessoal">{grid(TAB_FIELDS.identificacao)}</Card>}
      {tab === 'documentos' && (
        <Card title="Documentos">
          <Alert tone="info">O envio de documentos (CPF, identidade, cartão do convênio, encaminhamentos e exames) será liberado na próxima etapa, em armazenamento privado com link temporário. Por enquanto, informe apenas os números nas outras abas.</Alert>
        </Card>
      )}
      {tab === 'contato' && <Card title="Contato">{grid(TAB_FIELDS.contato)}</Card>}
      {tab === 'endereco' && <Card title="Endereço">{grid(TAB_FIELDS.endereco)}</Card>}
      {tab === 'administrativo' && (
        <Card title="Informações administrativas">
          <div className="mb-3 grid gap-3 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-muted">Número de prontuário</p><p className="font-medium">{reg?.record_number ?? 'Gerado ao salvar'}</p></div>
            <div><p className="text-xs text-muted">Data do cadastro</p><p className="font-medium">{reg ? fmtInstant(String(reg.created_at)) : '—'}</p></div>
            {isAdminUser && (
              <Field label="Situação cadastral" hint="Automática; use só para inativar ou marcar pendência de documentos.">
                <Select value={draft.registration_status ?? ''} onChange={(e) => set('registration_status', e.target.value)}
                  options={[{ value: 'auto', label: 'Automática (completo/incompleto)' }, { value: 'awaiting_documents', label: 'Aguardando documentos' }, { value: 'inactive', label: 'Inativo' }]} placeholder={reg ? STATUS_LABEL[reg.registration_status] : 'Automática'} />
              </Field>
            )}
          </div>
          {grid(TAB_FIELDS.administrativo)}
        </Card>
      )}
      {tab === 'responsaveis' && (
        <>
          <Card title="Contato de emergência">{grid(TAB_FIELDS.responsaveis)}</Card>
          <Card title="Responsável legal">
            {minor ? <Alert tone="warn">Paciente menor de 18 anos: os dados do responsável legal são necessários para concluir o cadastro.</Alert> : <p className="mb-2 text-sm text-muted">Preencha apenas se o paciente for menor de idade ou precisar de representação.</p>}
            <div className="mt-3">{grid(TAB_FIELDS.guardian)}</div>
          </Card>
        </>
      )}
      {tab === 'clinico' && (
        <Card title="Histórico clínico">
          {grid(TAB_FIELDS.clinico)}
          <p className="mt-3 text-xs text-muted">Medicamentos de uso contínuo e doenças associadas ficam no perfil clínico do paciente (Minha conta), disponível quando há conta vinculada.</p>
        </Card>
      )}
      {tab === 'consentimentos' && (mode === 'owner' ? <ConsentsCard /> : (
        <Card title="Consentimentos"><Empty>Os consentimentos (LGPD) são dados pelo próprio paciente, na conta dele. {view?.linked ? 'Este paciente já tem conta.' : 'Ele poderá concedê-los ao ativar a conta.'}</Empty></Card>
      ))}

      {!readOnly && (
        <div className="sticky bottom-16 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3 md:bottom-2">
          <Button disabled={act.busy || (!isNew && !dirty) || (isNew && !(draft.full_name ?? '').trim())} onClick={save}>{isNew ? 'Criar cadastro (rascunho)' : 'Salvar'}</Button>
          {!isNew && !dirty && <span className="text-xs text-muted">Sem alterações.</span>}
          {act.error && Object.keys(act.fields).length === 0 && <span className="text-sm text-bad">{act.error}</span>}
          {Object.keys(act.fields).length > 0 && <span className="text-sm text-bad">Corrija os campos destacados.</span>}
        </div>
      )}

      {isAdminUser && !isNew && view && !view.linked && (
        <Card title="Ativação da conta do paciente">
          <p className="mb-2 text-sm text-muted">Este paciente ainda não tem conta. Gere um código e entregue ao paciente junto com o número do prontuário. Ele cria a conta e informa os dois em <em>Meu cadastro</em>. O código vale 7 dias, tem 5 tentativas e é mostrado uma única vez.</p>
          <Button small variant="secondary" disabled={act.busy} onClick={() => act.run(async () => setCode(await registryGenerateCode(reg!.id)))}>{view.activation_pending ? 'Gerar novo código' : 'Gerar código de ativação'}</Button>
          {view.activation_pending && !code && <p className="mt-2 text-xs text-muted">Há um código ativo (não é possível exibi-lo novamente).</p>}
          {code && <Alert tone="good">Prontuário <strong>{reg!.record_number}</strong> · Código <strong className="font-mono text-base">{code}</strong>. Anote agora: ele não será mostrado de novo.</Alert>}
        </Card>
      )}
      {!isNew && view && ['owner', 'admin'].includes(view.access) && <History id={reg!.id} />}
    </div>
  )
}

function History({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['registry-history', id], queryFn: () => registryHistory(id) })
  const LABEL: Record<string, string> = { create: 'Criou', update: 'Alterou', activation_code: 'Gerou código de ativação', link: 'Vinculou a conta' }
  return (
    <Card title="Quem alterou e quando">
      <p className="mb-2 text-xs text-muted">Mostra apenas os nomes dos campos alterados, nunca os valores.</p>
      {q.isLoading ? <Spinner /> : <Table empty="Sem alterações registradas." head={['Data', 'Quem', 'Ação', 'Campos']}
        rows={(q.data ?? []).map((h) => [fmtInstant(h.created_at), h.actor_name ?? '—', LABEL[h.action] ?? h.action, h.fields.join(', ') || '—'])} />}
    </Card>
  )
}
