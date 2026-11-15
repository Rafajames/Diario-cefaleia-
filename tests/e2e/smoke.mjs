/**
 * Teste de fumaça da interface em navegador real (Chrome do sistema, via playwright-core).
 * Percorre os fluxos de paciente, profissional e administrador contra um Supabase FALSO em memória
 * e falha se houver erro de JavaScript em qualquer tela. Não substitui o teste contra um projeto Supabase real.
 *
 * Uso: npm run test:e2e        (variáveis: CHROME_PATH, E2E_SHOTS=pasta para capturas de tela)
 */
import { chromium } from 'playwright-core'
import { execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { createUser, db, startFake } from './fake-supabase.mjs'

const API = 54399, WEB = 4179
const shots = process.env.E2E_SHOTS
const chrome = process.env.CHROME_PATH ?? ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
if (!chrome) { console.error('Chrome/Chromium não encontrado. Defina CHROME_PATH.'); process.exit(2) }
if (shots) mkdirSync(shots, { recursive: true })

const env = { ...process.env, VITE_SUPABASE_URL: `http://127.0.0.1:${API}`, VITE_SUPABASE_ANON_KEY: 'chave-publica-falsa' }
execSync('npx vite build --outDir .tmp/e2e-dist --logLevel error', { env, stdio: 'inherit' })
const fake = await startFake(API)
const web = spawn('npx', ['vite', 'preview', '--outDir', '.tmp/e2e-dist', '--port', String(WEB), '--strictPort', '--host', '127.0.0.1'], { env, stdio: 'ignore' })
const base = `http://127.0.0.1:${WEB}`
for (let i = 0; i < 50; i++) { try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 200)) } }

const PW = 'senha-de-teste-123'
createUser('pro@teste.dev', PW, { full_name: 'Dra. Teste', consents: ['personal_data'] }, 'professional')
createUser('admin@teste.dev', PW, { full_name: 'Admin Teste', consents: ['personal_data'] }, 'admin')

const errors = []
const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] })
let step = ''
async function open(viewport) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: true, locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`[${step}] ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`[${step}] console: ${m.text()}`) })
  page.on('dialog', (d) => d.accept())
  page.setDefaultTimeout(8000)
  return page
}
const shot = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }) }
const at = async (page, name, fn) => { step = name; try { await fn() } catch (e) { errors.push(`[${name}] ${String(e.message).split('\n').slice(0, process.env.E2E_DEBUG ? 14 : 1).join('\n')}`); await shot(page, `ERRO-${name}`) } }
const login = async (page, email) => {
  await page.goto(`${base}/entrar`)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(PW)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

// ------------------------------------------------------------------ Paciente (celular)
let p = await open({ width: 390, height: 844 })
await at(p, 'cadastro', async () => {
  await p.goto(`${base}/cadastro`)
  await p.getByLabel('Nome completo').fill('Paciente de Teste')
  await p.getByLabel('E-mail').fill('paciente@teste.dev')
  await p.getByLabel('Senha', { exact: true }).fill(PW)
  await p.getByLabel('Confirmar senha').fill(PW)
  await p.getByRole('button', { name: 'Criar conta' }).click()
  await p.getByText('Este consentimento é necessário para criar a conta.').waitFor() // validação: consentimentos obrigatórios
  for (const i of [0, 1, 2]) await p.getByRole('checkbox').nth(i).check()
  await p.getByRole('button', { name: 'Criar conta' }).click()
  await p.getByText('Como foi hoje?').waitFor()
  await shot(p, '01-inicio')
})
await at(p, 'dia-sem-dor', async () => {
  await p.getByRole('button', { name: 'Hoje foi um dia sem dor' }).click()
  await p.getByRole('button', { name: /Sem dor hoje \(desfazer\)/ }).click()
  await p.getByRole('button', { name: 'Hoje foi um dia sem dor' }).waitFor()
})
await at(p, 'registro-diario', async () => {
  await p.getByRole('button', { name: /Registro diário/ }).click()
  await p.getByLabel('Horas dormidas').fill('7,5')
  await p.getByRole('button', { name: 'Salvar' }).click()
  await p.getByRole('dialog').waitFor({ state: 'detached' })
})
await at(p, 'nova-crise', async () => {
  await p.getByRole('link', { name: /Estou com dor/ }).click()
  await p.getByRole('radio', { name: '7', exact: true }).first().click()
  await p.getByText('Localização', { exact: true }).click()
  await p.getByRole('button', { name: 'Frontal' }).click()
  await p.getByText('Sintomas associados').click()
  await p.getByRole('button', { name: 'Náusea' }).click()
  await p.getByText('Possíveis desencadeantes e contexto').click()
  await p.getByRole('button', { name: 'Dormiu pouco' }).click()
  await p.getByText('Impacto nas atividades e observações').click()
  await p.getByRole('button', { name: /Moderado — precisou reduzir/ }).click()
  await shot(p, '02-formulario-crise')
  await p.getByRole('button', { name: 'Salvar crise' }).click()
  await p.getByText('Medicamentos nesta crise').waitFor()
})
await at(p, 'medicamento', async () => {
  await p.getByRole('button', { name: '+ Registrar medicamento' }).click()
  const d = p.getByRole('dialog')
  await d.getByLabel('Medicamento *').fill('Medicamento Teste')
  await d.getByLabel('Dose utilizada').fill('500')
  await d.getByLabel('Unidade').fill('mg')
  await d.getByRole('radio', { name: '7', exact: true }).click()
  await d.getByRole('button', { name: 'Salvar' }).click()
  await p.getByText('1ª administração — Medicamento Teste · 500 mg').waitFor()
  await p.getByRole('button', { name: 'Registrar resposta' }).click()
  await d.getByRole('button', { name: 'Melhorou parcialmente' }).click()
  await d.getByRole('button', { name: 'Salvar' }).click()
  await p.getByRole('button', { name: 'Editar resposta' }).waitFor()
  await p.getByRole('button', { name: '+ Avaliação após a dose' }).click()
  await d.getByRole('button', { name: '1 h', exact: true }).click()
  await d.getByRole('radio', { name: '3', exact: true }).click()
  await d.getByRole('button', { name: 'Salvar' }).click()
  await p.getByText('4 (de 7 para 3)').waitFor() // redução de intensidade calculada
  await shot(p, '03-crise-com-medicamento')
})
await at(p, 'encerrar-crise', async () => {
  await p.getByText('Duração e término').click()
  await p.getByLabel('Ainda estou com dor').uncheck()
  await p.getByRole('button', { name: 'Terminou agora' }).click()
  await p.getByRole('button', { name: 'Salvar alterações' }).click()
  await p.getByText('Alterações salvas.').waitFor()
})
await at(p, 'segunda-crise-mesmo-dia', async () => {
  await p.goto(`${base}/crises/nova`)
  await p.getByRole('radio', { name: '4', exact: true }).first().click()
  await p.getByRole('button', { name: 'Salvar crise' }).click()
  await p.getByText('Medicamentos nesta crise').waitFor()
  if (db.headache_attacks.length !== 2) throw new Error('esperava 2 crises registradas')
})
await at(p, 'calendario', async () => {
  await p.goto(`${base}/calendario`)
  await p.getByText('Dias em cinza não têm informação').waitFor()
  await p.getByText(/Pico 7\/10/).waitFor()
  await p.getByText(/Pico 4\/10/).waitFor()
  await shot(p, '04-calendario')
  await p.getByRole('button', { name: 'Mês anterior' }).click()
  await p.getByRole('button', { name: 'Voltar para hoje' }).click()
})
await at(p, 'ciclo', async () => {
  await p.goto(`${base}/ciclo`)
  await p.getByRole('button', { name: 'Quero registrar meu ciclo' }).click()
  await p.getByRole('button', { name: '+ Registrar sangramento' }).click()
  await p.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await p.getByText('último dia não informado').waitFor()
  await p.getByText('Dados insuficientes').first().waitFor()
  await shot(p, '05-ciclo')
})
await at(p, 'medicamentos', async () => {
  await p.goto(`${base}/medicamentos`)
  await p.getByRole('button', { name: '+ Adicionar' }).click()
  await p.getByRole('dialog').getByLabel('Medicamento *').fill('Preventivo Teste')
  await p.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await p.getByText('Preventivo Teste').waitFor()
})
await at(p, 'evolucao', async () => {
  await p.goto(`${base}/evolucao`)
  await p.getByText('Qualidade dos dados').waitFor()
  await p.getByText('Dados insuficientes').first().waitFor()
  await p.locator('.recharts-surface').first().waitFor()
  await shot(p, '06-evolucao')
})
await at(p, 'relatorio-pdf', async () => {
  await p.goto(`${base}/relatorios`)
  const [download] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.getByRole('button', { name: 'Gerar relatório em PDF' }).click()])
  const path = await download.path()
  if (statSync(path).size < 5000) throw new Error('PDF vazio ou muito pequeno')
  if (shots) await download.saveAs(`${shots}/relatorio.pdf`)
  const [csv] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'CSV — crises' }).click()])
  if (statSync(await csv.path()).size < 200) throw new Error('CSV vazio')
})
await at(p, 'perfil-compartilhar', async () => {
  await p.goto(`${base}/perfil`)
  await p.getByLabel('E-mail do profissional cadastrado').fill('pro@teste.dev')
  await p.getByRole('button', { name: 'Compartilhar', exact: true }).click()
  await p.getByText('Autorizado', { exact: true }).waitFor()
  await shot(p, '07-perfil')
})
await at(p, 'paciente-nao-entra-na-administracao', async () => {
  await p.goto(`${base}/admin`)
  await p.getByText('Como foi hoje?').waitFor() // redirecionado para a própria área
  await p.goto(`${base}/profissional`)
  await p.getByText('Como foi hoje?').waitFor()
})
await p.context().close()

// ------------------------------------------------------------------ Profissional (desktop)
p = await open({ width: 1280, height: 850 })
await at(p, 'profissional', async () => {
  await login(p, 'pro@teste.dev')
  await p.getByText('Pacientes vinculados').waitFor()
  await p.getByRole('button', { name: 'Abrir' }).click()
  await p.getByText('Informações declaradas pelo paciente').waitFor()
  await shot(p, '08-profissional-resumo')
  for (const tab of ['Calendário', 'Crises', 'Medicamentos', 'Resposta terapêutica', 'Menstruação', 'Hábitos', 'Evolução', 'Relatórios', 'Observações clínicas']) {
    step = `profissional/${tab}`
    await p.getByRole('tab', { name: tab }).click()
    await p.waitForTimeout(400)
  }
  await p.getByLabel('Conteúdo').fill('Observação de teste.')
  await p.getByRole('button', { name: 'Salvar' }).click()
  await p.getByText('Observação de teste.').waitFor()
  await p.getByRole('tab', { name: 'Evolução' }).click()
  await p.locator('.recharts-surface').first().waitFor()
  await shot(p, '09-profissional-evolucao')
  if (!db.access_logs.some((l) => l.action === 'open_record')) throw new Error('abertura de prontuário não foi registrada')
  await p.goto(`${base}/admin`)
  await p.getByText('Pacientes vinculados').waitFor() // profissional não entra na administração
})
await p.context().close()

// ------------------------------------------------------------------ Administrador (desktop)
p = await open({ width: 1280, height: 850 })
await at(p, 'admin', async () => {
  await login(p, 'admin@teste.dev')
  await p.getByText('Painel administrativo').waitFor()
  await shot(p, '10-admin')
  for (const [path, text] of [['usuarios', 'Autorizações vigentes'], ['vinculos', 'Propor vínculo'], ['convites', 'Novo convite'], ['catalogo', 'Catálogo de medicamentos'], ['configuracoes', 'Parâmetros gerais'], ['auditoria', 'Acessos a dados clínicos']]) {
    step = `admin/${path}`
    await p.goto(`${base}/admin/${path}`)
    await p.getByText(text).first().waitFor()
  }
  await shot(p, '11-admin-auditoria')
  await p.goto(`${base}/admin/convites`)
  await p.getByLabel('E-mail').fill('novo@teste.dev')
  await p.getByRole('button', { name: 'Convidar' }).click()
  await p.getByText('Aguardando cadastro').waitFor()
})
await p.context().close()

await browser.close(); web.kill(); fake.close()
if (errors.length) { console.error(`\nFALHOU — ${errors.length} problema(s):\n` + errors.map((e) => ` - ${e}`).join('\n')); process.exit(1) }
console.log('\nOK — fluxos de paciente, profissional e administrador percorridos sem erros de interface.')
