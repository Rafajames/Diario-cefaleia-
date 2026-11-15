/**
 * Testes de segurança do banco (RLS, gatilhos e RPCs) contra um PostgreSQL real.
 * Rodar com: npm run test:db:local   (sobe um banco temporário e descartável)
 * ou definir DATABASE_URL apontando para um banco de TESTE vazio.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const url = process.env.DATABASE_URL
const root = join(import.meta.dirname, '..', '..')
const dbName = `diario_test_${Date.now()}`
let admin: pg.Client
let db: pg.Client
const ids: Record<string, string> = {}

type Q = (sql: string, params?: unknown[]) => Promise<pg.QueryResult>

/** Executa como um usuário autenticado (papel "authenticated" + auth.uid()). Sempre desfaz ou confirma a transação. */
async function as<T>(user: string | null, fn: (q: Q) => Promise<T>, role = 'authenticated'): Promise<T> {
  await db.query('begin')
  try {
    await db.query(`set local role ${role}`)
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ? ids[user] : ''])
    const out = await fn((sql, params) => db.query(sql, params as never[]))
    await db.query('commit')
    return out
  } catch (e) {
    await db.query('rollback')
    throw e
  }
}
const rows = (user: string, sql: string, params?: unknown[]) => as(user, async (q) => (await q(sql, params)).rows)
const denied = (p: Promise<unknown>) => expect(p).rejects.toThrow()

async function signup(key: string, email: string, meta: object = {}) {
  const r = await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta])
  ids[key] = r.rows[0].id
}
const consent = (user: string, type: string, granted = true) =>
  as(user, (q) => q(`insert into consents (user_id, consent_type, version, granted) values ($1, $2, '1.0', $3)`, [ids[user], type, granted]))

describe.skipIf(!url)('segurança do banco (RLS)', () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: url })
    await admin.connect()
    await admin.query(`create database ${dbName}`)
    const u = new URL(url!)
    u.pathname = `/${dbName}`
    db = new pg.Client({ connectionString: u.toString() })
    await db.connect()
    await db.query(readFileSync(join(root, 'tests/integration/supabase-stub.sql'), 'utf8'))
    const dir = join(root, 'supabase/migrations')
    for (const f of readdirSync(dir).sort()) await db.query(readFileSync(join(dir, f), 'utf8'))

    await signup('ana', 'ana@teste.dev', { full_name: 'Ana Paciente', role: 'admin' })
    await signup('bia', 'bia@teste.dev', { full_name: 'Bia Paciente' })
    await db.query(`insert into invites (email, role) values ('dr@teste.dev', 'professional'), ('dr2@teste.dev', 'professional')`)
    await signup('dr', 'DR@teste.dev', { full_name: 'Dr. Vinculado' })
    await signup('dr2', 'dr2@teste.dev', { full_name: 'Dr. Sem Vínculo' })
    await signup('root', 'root@teste.dev', { full_name: 'Admin' })
    await signup('root2', 'root2@teste.dev', { full_name: 'Admin 2' })
    // Provisionamento administrativo: somente direto no banco (auth.uid() nulo)
    await db.query(`update profiles set role = 'admin' where id = any($1)`, [[ids.root, ids.root2]])
    for (const p of ['ana', 'bia']) {
      await consent(p, 'personal_data')
      await consent(p, 'health_data')
    }
    await as('ana', async (q) => {
      await q(`insert into headache_attacks (patient_id, started_at, intensity_max) values ($1, '2026-11-01 08:00', 7)`, [ids.ana])
      await q(`insert into menstrual_cycles (patient_id, start_date) values ($1, '2026-11-02')`, [ids.ana])
      await q(`insert into daily_logs (patient_id, log_date, pain_free_confirmed) values ($1, '2026-11-03', true)`, [ids.ana])
    })
  })

  afterAll(async () => {
    await db?.end()
    await admin?.query(`drop database if exists ${dbName} with (force)`)
    await admin?.end()
  })

  describe('cadastro e funções', () => {
    it('cadastro cria perfil de paciente e ignora função enviada pelo cliente', async () => {
      const r = await db.query(`select role, full_name from profiles where id = $1`, [ids.ana])
      expect(r.rows[0]).toEqual({ role: 'patient', full_name: 'Ana Paciente' })
      expect((await db.query(`select 1 from patients where id = $1`, [ids.ana])).rowCount).toBe(1)
    })
    it('consentimentos marcados no cadastro são gravados com a versão vigente; valores inválidos são ignorados', async () => {
      await signup('cora', 'cora@teste.dev', { consents: ['personal_data', 'health_data', 'health_data', 'admin'] })
      const r = await db.query(`select consent_type, version, granted from consents where user_id = $1 order by consent_type`, [ids.cora])
      expect(r.rows).toEqual([
        { consent_type: 'personal_data', version: '1.0', granted: true },
        { consent_type: 'health_data', version: '1.0', granted: true },
      ])
    })
    it('convite válido define a função profissional (e-mail sem diferenciar maiúsculas)', async () => {
      const r = await db.query(`select role from profiles where id = $1`, [ids.dr])
      expect(r.rows[0].role).toBe('professional')
      expect((await db.query(`select accepted_at from invites where email = 'dr@teste.dev'`)).rows[0].accepted_at).not.toBeNull()
    })
    it('cadastro público desativado bloqueia quem não tem convite', async () => {
      await db.query(`update app_settings set value = 'false' where key = 'public_signup_enabled'`)
      await denied(db.query(`insert into auth.users (email) values ('intruso@teste.dev')`))
      await db.query(`insert into invites (email, role) values ('convidada@teste.dev', 'patient')`)
      await signup('convidada', 'convidada@teste.dev')
      await db.query(`update app_settings set value = 'true' where key = 'public_signup_enabled'`)
    })
    it('usuário comum não altera a própria função nem situação', async () => {
      await denied(as('ana', (q) => q(`update profiles set role = 'admin' where id = $1`, [ids.ana])))
      await denied(as('ana', (q) => q(`update profiles set role = 'professional' where id = $1`, [ids.ana])))
      await denied(as('dr', (q) => q(`update profiles set role = 'admin' where id = $1`, [ids.dr])))
      const r = await as('ana', (q) => q(`update profiles set full_name = 'Ana P.' where id = $1`, [ids.ana]))
      expect(r.rowCount).toBe(1)
    })
    it('usuário comum não altera perfil de outra pessoa', async () => {
      const r = await as('ana', (q) => q(`update profiles set full_name = 'x' where id = $1`, [ids.bia]))
      expect(r.rowCount).toBe(0)
    })
    it('administrador não altera a própria função nem promove alguém a administrador', async () => {
      await denied(as('root', (q) => q(`update profiles set role = 'patient' where id = $1`, [ids.root])))
      await denied(as('root', (q) => q(`update profiles set status = 'suspended' where id = $1`, [ids.root])))
      await denied(as('root', (q) => q(`update profiles set role = 'admin' where id = $1`, [ids.dr2])))
      await denied(as('root', (q) => q(`update profiles set role = 'patient' where id = $1`, [ids.root2])))
    })
  })

  describe('isolamento entre pacientes', () => {
    it('paciente lê os próprios dados', async () => {
      expect(await rows('ana', `select id from headache_attacks`)).toHaveLength(1)
    })
    it('paciente não lê dados de outro paciente', async () => {
      for (const t of ['headache_attacks', 'daily_logs', 'menstrual_cycles', 'patients', 'consents', 'audit_log', 'access_logs'])
        expect((await rows('bia', `select * from ${t}`)).filter((r) => (r.patient_id ?? r.user_id ?? r.id) === ids.ana)).toHaveLength(0)
    })
    it('paciente não escreve em nome de outro paciente', async () => {
      await denied(as('bia', (q) => q(`insert into headache_attacks (patient_id, started_at) values ($1, '2026-11-05 10:00')`, [ids.ana])))
      const up = await as('bia', (q) => q(`update headache_attacks set intensity_max = 1 where patient_id = $1`, [ids.ana]))
      expect(up.rowCount).toBe(0)
      const del = await as('bia', (q) => q(`delete from headache_attacks where patient_id = $1`, [ids.ana]))
      expect(del.rowCount).toBe(0)
    })
    it('paciente não anexa avaliação à crise de outro paciente', async () => {
      const attack = (await db.query(`select id from headache_attacks where patient_id = $1`, [ids.ana])).rows[0].id
      await denied(as('bia', (q) => q(
        `insert into attack_assessments (attack_id, patient_id, assessed_at, intensity) values ($1, $2, '2026-11-01 09:00', 3)`, [attack, ids.bia])))
    })
    it('sem consentimento de dados de saúde não é possível registrar', async () => {
      await denied(as('convidada', (q) => q(`insert into headache_attacks (patient_id, started_at) values ($1, '2026-11-05 10:00')`, [ids.convidada])))
    })
    it('validação no servidor rejeita intensidade fora de 0–10 e término antes do início', async () => {
      await denied(as('ana', (q) => q(`insert into headache_attacks (patient_id, started_at, intensity_max) values ($1, '2026-11-05 10:00', 11)`, [ids.ana])))
      await denied(as('ana', (q) => q(`insert into headache_attacks (patient_id, started_at, ended_at) values ($1, '2026-11-05 10:00', '2026-11-05 09:00')`, [ids.ana])))
    })
    it('usuário anônimo não acessa nenhuma tabela', async () => {
      await denied(as(null, (q) => q(`select * from headache_attacks`), 'anon'))
      await denied(as(null, (q) => q(`select * from profiles`), 'anon'))
      const cfg = await as(null, (q) => q(`select public_config() c`), 'anon')
      expect(cfg.rows[0].c.public_signup_enabled).toBe(true)
    })
  })

  describe('acesso de profissional', () => {
    it('sem vínculo: não vê dados nem consegue abrir o prontuário', async () => {
      expect(await rows('dr', `select id from headache_attacks`)).toHaveLength(0)
      expect(await rows('dr', `select id from patients`)).toHaveLength(0)
      await denied(as('dr', (q) => q(`select open_patient_record($1)`, [ids.ana])))
    })
    it('profissional não cria vínculo por conta própria', async () => {
      await denied(as('dr', (q) => q(`insert into care_links (patient_id, grantee_id, status) values ($1, $2, 'active')`, [ids.ana, ids.dr])))
    })
    it('vínculo criado pelo administrador nasce pendente e não dá acesso', async () => {
      await as('root', (q) => q(`insert into care_links (patient_id, grantee_id, status, include_menstruation) values ($1, $2, 'active', true)`, [ids.ana, ids.dr]))
      const l = (await db.query(`select status, include_menstruation from care_links where patient_id = $1`, [ids.ana])).rows[0]
      expect(l).toEqual({ status: 'pending', include_menstruation: false })
      await denied(as('dr', (q) => q(`select open_patient_record($1)`, [ids.ana])))
    })
    it('profissional e administrador não conseguem ativar o vínculo; só o paciente', async () => {
      await denied(as('dr', (q) => q(`update care_links set status = 'active' where patient_id = $1`, [ids.ana])))
      await denied(as('root', (q) => q(`update care_links set status = 'active' where patient_id = $1`, [ids.ana])))
      const r = await as('ana', (q) => q(`update care_links set status = 'active' where patient_id = $1`, [ids.ana]))
      expect(r.rowCount).toBe(1)
    })
    it('vínculo ativo sem consentimento de compartilhamento não dá acesso', async () => {
      await denied(as('dr', (q) => q(`select open_patient_record($1)`, [ids.ana])))
    })
    it('com consentimento, ainda exige abertura de prontuário registrada', async () => {
      await consent('ana', 'professional_sharing')
      expect(await rows('dr', `select id from headache_attacks`)).toHaveLength(0)
      await as('dr', (q) => q(`select open_patient_record($1)`, [ids.ana]))
      expect(await rows('dr', `select id from headache_attacks`)).toHaveLength(1)
      expect(await rows('dr', `select id from daily_logs`)).toHaveLength(1)
    })
    it('o paciente enxerga quem acessou seus dados', async () => {
      const logs = await rows('ana', `select actor_id, action from access_logs where action = 'open_record'`)
      expect(logs).toEqual([{ actor_id: ids.dr, action: 'open_record' }])
    })
    it('menstruação só é visível quando o paciente autoriza especificamente', async () => {
      expect(await rows('dr', `select id from menstrual_cycles`)).toHaveLength(0)
      await as('ana', (q) => q(`update care_links set include_menstruation = true where patient_id = $1`, [ids.ana]))
      expect(await rows('dr', `select id from menstrual_cycles`)).toHaveLength(1)
    })
    it('profissional não altera dados do paciente', async () => {
      const up = await as('dr', (q) => q(`update headache_attacks set intensity_max = 0`))
      expect(up.rowCount).toBe(0)
      await denied(as('dr', (q) => q(`insert into daily_logs (patient_id, log_date) values ($1, '2026-11-09')`, [ids.ana])))
    })
    it('profissional registra observação clínica; paciente lê mas não escreve', async () => {
      await as('dr', (q) => q(`insert into clinical_notes (patient_id, author_id, content) values ($1, $2, 'Obs.')`, [ids.ana, ids.dr]))
      expect(await rows('ana', `select content from clinical_notes`)).toHaveLength(1)
      await denied(as('bia', (q) => q(`insert into clinical_notes (patient_id, author_id, content) values ($1, $2, 'x')`, [ids.ana, ids.bia])))
      await denied(as('dr', (q) => q(`insert into clinical_notes (patient_id, author_id, content) values ($1, $2, 'x')`, [ids.ana, ids.dr2])))
    })
    it('outro profissional, sem vínculo, continua sem acesso', async () => {
      expect(await rows('dr2', `select id from headache_attacks`)).toHaveLength(0)
      expect(await rows('dr2', `select id from clinical_notes`)).toHaveLength(0)
    })
    it('revogar o consentimento ou o vínculo encerra o acesso imediatamente', async () => {
      await consent('ana', 'professional_sharing', false)
      expect(await rows('dr', `select id from headache_attacks`)).toHaveLength(0)
      await consent('ana', 'professional_sharing', true)
      expect(await rows('dr', `select id from headache_attacks`)).toHaveLength(1)
      await as('ana', (q) => q(`update care_links set status = 'revoked' where patient_id = $1`, [ids.ana]))
      expect(await rows('dr', `select id from headache_attacks`)).toHaveLength(0)
      await as('ana', (q) => q(`update care_links set status = 'active' where patient_id = $1`, [ids.ana]))
    })
    it('profissional suspenso perde o acesso', async () => {
      await as('root', (q) => q(`update profiles set status = 'suspended' where id = $1`, [ids.dr]))
      expect(await rows('dr', `select id from headache_attacks`)).toHaveLength(0)
      await as('root', (q) => q(`update profiles set status = 'active' where id = $1`, [ids.dr]))
      expect(await rows('dr', `select id from headache_attacks`)).toHaveLength(1)
    })
  })

  describe('administração', () => {
    it('usuário comum não acessa funções nem tabelas administrativas', async () => {
      for (const u of ['ana', 'dr']) {
        await denied(as(u, (q) => q(`select admin_stats()`)))
        await denied(as(u, (q) => q(`select * from admin_audit_log()`)))
        await denied(as(u, (q) => q(`select admin_aggregate_report()`)))
        expect(await rows(u, `select id from invites`)).toHaveLength(0)
        await denied(as(u, (q) => q(`insert into invites (email) values ('x@teste.dev')`)))
        const up = await as(u, (q) => q(`update app_settings set value = 'false' where key = 'public_signup_enabled'`))
        expect(up.rowCount).toBe(0)
      }
    })
    it('administrador vê estatísticas agregadas, mas não dados clínicos sem autorização', async () => {
      const s = (await rows('root', `select admin_stats() s`))[0].s
      expect(s.patients).toBeGreaterThanOrEqual(2)
      expect(await rows('root', `select id from headache_attacks`)).toHaveLength(0)
      expect(await rows('root', `select id from audit_log where patient_id is distinct from $1`, [ids.root])).toHaveLength(0)
      await denied(as('root', (q) => q(`select open_patient_record($1)`, [ids.ana])))
    })
    it('log de auditoria do administrador não expõe conteúdo clínico', async () => {
      const r = await rows('root', `select * from admin_audit_log(5)`)
      expect(r.length).toBeGreaterThan(0)
      expect(Object.keys(r[0])).not.toContain('old_data')
      expect(Object.keys(r[0])).not.toContain('new_data')
    })
    it('relatório populacional exige grupo mínimo de pacientes com consentimento de pesquisa', async () => {
      const r = (await rows('root', `select admin_aggregate_report() r`))[0].r
      expect(r.insufficient).toBe(true)
    })
    it('administrador suspende conta; paciente suspenso não acessa nem os próprios dados', async () => {
      await as('root', (q) => q(`update profiles set status = 'suspended' where id = $1`, [ids.bia]))
      expect(await rows('bia', `select id from patients`)).toHaveLength(0)
      await denied(as('bia', (q) => q(`insert into daily_logs (patient_id, log_date) values ($1, '2026-11-09')`, [ids.bia])))
      await as('root', (q) => q(`update profiles set status = 'active' where id = $1`, [ids.bia]))
      expect(await rows('bia', `select id from patients`)).toHaveLength(1)
    })
    it('eliminação de dados não pode ser disparada por requisição comum', async () => {
      await denied(as('root', (q) => q(`select app.purge_patient($1)`, [ids.bia])))
    })
  })

  describe('auditoria', () => {
    it('edição e exclusão lógica de crise ficam no histórico do paciente', async () => {
      await as('ana', (q) => q(`update headache_attacks set intensity_max = 8 where patient_id = $1`, [ids.ana]))
      const id = (await as('ana', (q) => q(
        `insert into headache_attacks (patient_id, started_at) values ($1, '2026-11-06 10:00') returning id`, [ids.ana]))).rows[0].id
      await as('ana', (q) => q(`update headache_attacks set deleted_at = now() where id = $1`, [id]))
      const log = await rows('ana', `select action, old_data, new_data from audit_log where table_name = 'headache_attacks' order by id`)
      expect(log.map((l) => l.action)).toEqual(['INSERT', 'UPDATE', 'INSERT', 'UPDATE'])
      expect(log[1].old_data.intensity_max).toBe(7)
      expect(log[1].new_data.intensity_max).toBe(8)
      expect(log[3].new_data.deleted_at).not.toBeNull()
    })
    it('consentimentos formam histórico imutável', async () => {
      const up = as('ana', (q) => q(`update consents set granted = false where user_id = $1`, [ids.ana]))
      await denied(up)
      await denied(as('ana', (q) => q(`delete from consents where user_id = $1`, [ids.ana])))
    })
  })

  describe('administrador com atuação clínica (somente contas habilitadas no banco)', () => {
    it('administrador não habilitado não pode receber vínculo nem usar o painel profissional', async () => {
      await denied(as('bia', (q) => q(`insert into care_links (patient_id, grantee_id, status) values ($1, $2, 'active')`, [ids.bia, ids.root2])))
      await denied(as('root2', (q) => q(`select * from professional_overview()`)))
      expect(await rows('bia', `select id from find_grantee_by_email('root2@teste.dev')`)).toHaveLength(0)
    })
    it('o aplicativo não consegue habilitar a atuação clínica (nem o próprio administrador)', async () => {
      await denied(as('root', (q) => q(`update profiles set clinical_enabled = true where id = $1`, [ids.root])))
      await denied(as('root', (q) => q(`update profiles set clinical_enabled = true where id = $1`, [ids.root2])))
      await denied(as('bia', (q) => q(`update profiles set clinical_enabled = true where id = $1`, [ids.bia])))
    })
    it('habilitado no banco, atua como médico, mas só com vínculo, consentimento e abertura registrada', async () => {
      await db.query(`update profiles set clinical_enabled = true where id = $1`, [ids.root])
      await db.query(`insert into professionals (id) values ($1) on conflict do nothing`, [ids.root])
      expect(await rows('bia', `select id from find_grantee_by_email('root@teste.dev')`)).toHaveLength(1)
      await as('bia', (q) => q(`insert into care_links (patient_id, grantee_id, status) values ($1, $2, 'active')`, [ids.bia, ids.root]))
      await consent('bia', 'professional_sharing')
      expect(await rows('root', `select id from patients where id = $1`, [ids.bia])).toHaveLength(0)
      await as('root', (q) => q(`select open_patient_record($1)`, [ids.bia]))
      expect(await rows('root', `select id from patients where id = $1`, [ids.bia])).toHaveLength(1)
      await as('root', (q) => q(`insert into clinical_notes (patient_id, author_id, content) values ($1, $2, 'Obs. do médico-administrador')`, [ids.bia, ids.root]))
      expect(await rows('bia', `select content from clinical_notes`)).toHaveLength(1)
    })
    it('o outro administrador, não habilitado, continua sem acesso aos dados do mesmo paciente', async () => {
      expect(await rows('root2', `select id from patients where id = $1`, [ids.bia])).toHaveLength(0)
      await denied(as('root2', (q) => q(`select open_patient_record($1)`, [ids.bia])))
    })
  })

  describe('painel do médico: retornos e convite de vínculo', () => {
    it('retorno só por quem tem vínculo ativo e consentimento; o paciente lê; terceiros não', async () => {
      await as('root', (q) => q(`insert into follow_ups (patient_id, professional_id, next_return, reason) values ($1, $2, '2030-01-10', 'Revisão')`, [ids.bia, ids.root]))
      await denied(as('root2', (q) => q(`insert into follow_ups (patient_id, professional_id, next_return) values ($1, $2, '2030-01-10')`, [ids.bia, ids.root2])))
      await denied(as('dr2', (q) => q(`insert into follow_ups (patient_id, professional_id, next_return) values ($1, $2, '2030-01-10')`, [ids.bia, ids.dr2])))
      expect(await rows('bia', `select next_return::text from follow_ups`)).toHaveLength(1)
      expect(await rows('root2', `select id from follow_ups`)).toHaveLength(0)
      expect(await rows('dr2', `select id from follow_ups`)).toHaveLength(0)
    })
    it('convite pelo e-mail: cria vínculo pendente e a resposta não revela se o e-mail existe', async () => {
      await as('dr2', (q) => q(`select request_patient_link('nao-existe@teste.dev')`))
      await as('dr2', (q) => q(`select request_patient_link('BIA@teste.dev')`))
      await as('dr2', (q) => q(`select request_patient_link('bia@teste.dev')`))
      const l = (await db.query(`select status from care_links where patient_id = $1 and grantee_id = $2`, [ids.bia, ids.dr2])).rows
      expect(l).toEqual([{ status: 'pending' }])
      expect(await rows('dr2', `select id from patients where id = $1`, [ids.bia])).toHaveLength(0)
    })
    it('paciente e administrador não habilitado não usam o convite', async () => {
      await denied(as('bia', (q) => q(`select request_patient_link('ana@teste.dev')`)))
      await denied(as('root2', (q) => q(`select request_patient_link('ana@teste.dev')`)))
    })
  })
})
