/**
 * Supabase FALSO, em memória, apenas para o teste de fumaça da interface (tests/e2e/smoke.mjs).
 * Imita o mínimo das rotas /auth/v1 e /rest/v1 usadas pelo app. NÃO aplica RLS nem regras do banco:
 * a segurança é testada contra PostgreSQL real em tests/integration. Nunca usar fora de testes.
 */
import http from 'node:http'
import { randomUUID } from 'node:crypto'

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = () => new Date().toISOString()
export const db = { users: [], sessions: new Map() }
const table = (t) => (db[t] ??= [])

const SETTINGS = [
  ['public_signup_enabled', true], ['consent_versions', { personal_data: '1.0', health_data: '1.0', professional_sharing: '1.0', research: '1.0' }],
  ['post_dose_intervals_min', [30, 60, 120, 240]], ['severity_bands', { mild_max: 3, moderate_max: 6 }],
  ['menstrual_window', { days_before: 2, days_after: 2, min_cycles: 3, min_positive: 2 }], ['evolution_rules', { relative_threshold: 0.2, min_attacks: 3, min_coverage: 0.5 }],
  ['overuse_flags', { enabled: false, reviewed_by: null, rules: [] }], ['retention', { audit_log_months: 60, access_log_months: 60 }],
]
table('app_settings').push(...SETTINGS.map(([key, value]) => ({ key, value, description: `Parâmetro ${key}`, updated_at: now() })))

export function createUser(email, password, meta = {}, role = 'patient') {
  const id = randomUUID()
  db.users.push({ id, email, password, user_metadata: meta })
  table('profiles').push({ id, email, full_name: meta.full_name ?? '', role, status: 'active', created_at: now(), updated_at: now() })
  if (role === 'patient') table('patients').push({ id, timezone: 'America/Manaus', tracks_menstruation: false, birth_date: null, phone: null, sex_at_birth: null, gender: null, country: null, city: null,
    pain_onset_approx: null, usual_frequency: null, reported_diagnosis: null, clinical_history: null, comorbidities: null, continuous_medications: null, cycle_regularity: null,
    usual_cycle_days: null, usual_bleeding_days: null, next_period_expected: null, hormonal_contraceptive: null, menstrual_notes: null })
  for (const c of meta.consents ?? []) table('consents').push({ id: randomUUID(), user_id: id, consent_type: c, version: '1.0', granted: true, created_at: now() })
  return id
}

function session(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: 'authenticated', aud: 'authenticated', email: user.email, exp })}.sig`
  db.sessions.set(access_token, user.id)
  const u = { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, user_metadata: user.user_metadata, app_metadata: {}, created_at: now() }
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: randomUUID(), user: u }
}

const DEFAULTS = {
  headache_attacks: () => ({ recorded_at: now(), updated_at: now(), deleted_at: null }),
  care_links: () => ({ created_at: now(), authorized_at: now(), revoked_at: null }),
  consents: () => ({ created_at: now() }),
  clinical_notes: () => ({ created_at: now(), updated_at: now() }),
  invites: () => ({ created_at: now(), expires_at: new Date(Date.now() + 14 * 864e5).toISOString(), accepted_at: null, revoked_at: null }),
  deletion_requests: () => ({ requested_at: now(), status: 'pending', processed_at: null, admin_note: null }),
  medications: () => ({ active: true }),
}

function match(row, col, expr) {
  const [op, ...rest] = expr.split('.')
  const val = rest.join('.')
  const v = row[col]
  if (op === 'eq') return String(v) === val
  if (op === 'neq') return String(v) !== val
  if (op === 'is') return val === 'null' ? v === null || v === undefined : String(v) === val
  if (op === 'gte') return v !== null && v !== undefined && String(v) >= val
  if (op === 'lte') return v !== null && v !== undefined && String(v) <= val
  if (op === 'in') return val.slice(1, -1).split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(v))
  throw new Error(`operador não suportado no fake: ${op}`)
}

function filter(rows, params) {
  let out = rows
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
    if (k === 'or') {
      const parts = v.slice(1, -1).split(',').map((p) => { const [col, ...e] = p.split('.'); return [col, e.join('.')] })
      out = out.filter((r) => parts.some(([c, e]) => match(r, c, e)))
    } else out = out.filter((r) => match(r, k, v))
  }
  const order = params.get('order')
  if (order) {
    const [col, dir] = order.split(',')[0].split('.')
    out = [...out].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (dir === 'desc' ? -1 : 1))
  }
  const limit = params.get('limit')
  return limit ? out.slice(0, Number(limit)) : out
}

const RPC = {
  public_config: () => ({ public_signup_enabled: true, consent_versions: SETTINGS[1][1] }),
  find_grantee_by_email: (_u, a) => table('profiles').filter((p) => p.email === a.p_email.toLowerCase() && p.role !== 'patient').map(({ id, full_name, role }) => ({ id, full_name, role })),
  open_patient_record: (uid, a) => { table('access_logs').push({ id: table('access_logs').length + 1, actor_id: uid, patient_id: a.p_patient_id, action: 'open_record', detail: null, created_at: now() }); return true },
  log_report_event: (uid, a) => { table('access_logs').push({ id: table('access_logs').length + 1, actor_id: uid, patient_id: a.p_patient_id, action: a.p_kind, detail: a.p_detail ?? null, created_at: now() }); return null },
  professional_overview: (uid) => table('care_links').filter((l) => l.grantee_id === uid && l.status !== 'revoked').map((l) => ({
    patient_id: l.patient_id, full_name: table('profiles').find((p) => p.id === l.patient_id)?.full_name ?? '', link_status: l.status, include_menstruation: l.include_menstruation,
    last_record_at: table('headache_attacks').filter((a) => a.patient_id === l.patient_id).map((a) => a.recorded_at).sort().pop() ?? null,
    attacks_30d: table('headache_attacks').filter((a) => a.patient_id === l.patient_id).length })),
  admin_stats: () => ({ total_users: db.users.length, patients: table('patients').length, professionals: 1, suspended: 0, active_patients_30d: 1, new_signups_30d: db.users.length,
    records_total: table('headache_attacks').length, attacks_total: table('headache_attacks').length, reports_generated: 0, active_links: table('care_links').length, pending_deletions: 0, generated_at: now() }),
  admin_aggregate_report: () => ({ insufficient: true, minimum_group: 5, consenting_patients: 0 }),
  admin_audit_log: () => [],
}

export function startFake(port) {
  const server = http.createServer(async (req, res) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json', ...cors }); res.end(body === undefined ? '' : JSON.stringify(body)) }
    if (req.method === 'OPTIONS') return send(204)
    const url = new URL(req.url, 'http://x')
    let raw = ''
    for await (const c of req) raw += c
    const body = raw ? JSON.parse(raw) : {}
    const uid = db.sessions.get((req.headers.authorization ?? '').replace('Bearer ', '')) ?? null
    try {
      const p = url.pathname
      if (p === '/auth/v1/signup') {
        if (db.users.some((u) => u.email === body.email)) return send(422, { code: 422, msg: 'User already registered' })
        createUser(body.email, body.password, body.data ?? {})
        return send(200, session(db.users.at(-1)))
      }
      if (p === '/auth/v1/token') {
        const u = db.users.find((x) => x.email === body.email && x.password === body.password)
        return u ? send(200, session(u)) : send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' })
      }
      if (p === '/auth/v1/user') {
        const u = db.users.find((x) => x.id === uid)
        if (!u) return send(401, { msg: 'invalid JWT' })
        if (req.method === 'PUT' && body.password) u.password = body.password
        return send(200, session(u).user)
      }
      if (p === '/auth/v1/logout') return send(204)
      if (p.startsWith('/rest/v1/rpc/')) {
        const fn = RPC[p.split('/').pop()]
        return fn ? send(200, fn(uid, body)) : send(404, { message: 'rpc inexistente no fake' })
      }
      if (p.startsWith('/rest/v1/')) {
        const name = p.split('/').pop()
        const rows = table(name)
        const single = (req.headers.accept ?? '').includes('vnd.pgrst.object')
        const prefer = req.headers.prefer ?? ''
        const reply = (list) => {
          if (single) return list.length === 1 ? send(200, list[0]) : send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })
          return send(200, list)
        }
        if (req.method === 'GET') return reply(filter(rows, url.searchParams))
        if (req.method === 'POST') {
          const conflict = url.searchParams.get('on_conflict')?.split(',')
          const out = (Array.isArray(body) ? body : [body]).map((item) => {
            const existing = conflict && prefer.includes('merge-duplicates') ? rows.find((r) => conflict.every((c) => r[c] === item[c])) : null
            if (existing) return Object.assign(existing, item, { updated_at: now() })
            const row = { id: randomUUID(), ...(DEFAULTS[name]?.() ?? { recorded_at: now(), updated_at: now() }), ...item }
            rows.push(row)
            return row
          })
          return prefer.includes('return=representation') ? (single ? send(201, out[0]) : send(201, out)) : send(201)
        }
        if (req.method === 'PATCH') {
          const hit = filter(rows, url.searchParams)
          for (const r of hit) Object.assign(r, body, { updated_at: now() })
          return prefer.includes('return=representation') ? reply(hit) : send(204)
        }
        if (req.method === 'DELETE') {
          const hit = new Set(filter(rows, url.searchParams))
          db[name] = rows.filter((r) => !hit.has(r))
          return send(204)
        }
      }
      send(404, { message: `rota não suportada no fake: ${req.method} ${p}` })
    } catch (e) {
      send(500, { message: String(e.message ?? e) })
    }
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}
