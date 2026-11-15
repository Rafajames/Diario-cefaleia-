import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Spinner, cx } from '@/components/ui'
import { labelOf } from '@/config/clinical-options'
import { useAction } from '@/hooks/useDraft'
import { useDataset } from '@/services/dataset'
import { useSettings } from '@/services/settings'
import { addDays, eachDay, fmtDate, fmtDateTime, todayLocal } from '@/utils/datetime'
import { friendlyError } from '@/utils/errors'
import { useProfile } from '@/modules/authentication/AuthProvider'
import { STATUS_LABEL, summarizeDay, type DayStatus } from '@/modules/calendar/calc'
import { overuseSignals } from '@/modules/clinical-evolution/calc'
import { DailyLogModal } from '@/modules/daily-context/DailyLogForm'
import { setPainFree } from '@/modules/daily-context/service'
import { fetchMyLinks } from './service'

const DOT: Record<DayStatus, string> = {
  no_record: 'bg-day-none', logged: 'bg-day-none', pain_free: 'bg-day-free', mild: 'bg-day-mild', moderate: 'bg-day-moderate', severe: 'bg-day-severe', pain_unrated: 'bg-day-unrated',
}

/** Tela inicial do paciente: o registro de hoje em um toque. */
export function HomePage() {
  const me = useProfile()
  const settings = useSettings()
  const today = todayLocal()
  const from = addDays(today, -29)
  const q = useDataset(me.id, from, today)
  const links = useQuery({ queryKey: ['links', me.id], queryFn: () => fetchMyLinks(me.id) })
  const [logOpen, setLogOpen] = useState(false)
  const act = useAction()
  if (q.isLoading) return <Spinner />
  if (q.error || !q.data) return <Alert tone="bad">{friendlyError(q.error)}</Alert>
  const day = summarizeDay(today, q.data, settings.severity_bands, today)
  const ongoing = q.data.attacks.filter((a) => a.still_ongoing)
  const strip = eachDay(addDays(today, -13), today).map((d) => summarizeDay(d, q.data!, settings.severity_bands, today))
  const pending = links.data?.filter((l) => l.status === 'pending').length ?? 0
  const signals = overuseSignals(q.data.administrations, settings.overuse_flags, today)
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Olá{me.full_name ? `, ${me.full_name.split(' ')[0]}` : ''}</h1>
        <p className="text-sm text-muted">Hoje, {fmtDate(today)} — {STATUS_LABEL[day.status].toLowerCase()}</p>
      </div>
      {pending > 0 && <Alert tone="warn">Há {pending} pedido(s) de vínculo aguardando sua autorização. <Link className="font-semibold underline" to="/perfil">Ver em Meu perfil</Link></Alert>}
      {signals.map((s, i) => (
        <Alert key={i} tone="warn">Sinalização informativa: você registrou medicação para crise ({s.classes.map((k) => labelOf('medCategory', k).toLowerCase()).join(', ')}) em {s.days} dias nos últimos 30. Converse com o profissional que acompanha você. Isto não é um diagnóstico.</Alert>
      ))}
      {ongoing.map((a) => (
        <Card key={a.id} className="border-warn/40 bg-warn-soft">
          <p className="font-semibold">Crise em andamento desde {fmtDateTime(a.started_at)}</p>
          <p className="mb-2 text-sm text-muted">Registre medicamentos, como a dor está agora ou o término.</p>
          <Link to={`/crises/${a.id}`}><Button small>Atualizar esta crise</Button></Link>
        </Card>
      ))}
      <Card title="Como foi hoje?">
        <div className="grid gap-2 sm:grid-cols-3">
          <Link to="/crises/nova"><Button className="w-full">Estou com dor / tive uma crise</Button></Link>
          {!day.attacks.length && (day.dailyLog?.pain_free_confirmed
            ? <Button variant="secondary" disabled={act.busy} onClick={() => act.run(() => setPainFree(me.id, today, day.dailyLog, false))}>✓ Sem dor hoje (desfazer)</Button>
            : <Button variant="secondary" disabled={act.busy} onClick={() => act.run(() => setPainFree(me.id, today, day.dailyLog, true))}>Hoje foi um dia sem dor</Button>)}
          <Button variant="ghost" onClick={() => setLogOpen(true)}>Registro diário (sono, hábitos…)</Button>
        </div>
        {act.error && <div className="mt-2"><Alert tone="bad">{act.error}</Alert></div>}
        <p className="mt-2 text-xs text-muted">Marcar os dias sem dor é importante: dia sem registro não é contado como dia sem dor.</p>
      </Card>
      <Card title="Últimos 14 dias" action={<Link className="text-sm text-brand" to="/calendario">Abrir calendário</Link>}>
        <div className="grid grid-cols-7 gap-1 sm:grid-cols-14">
          {strip.map((d) => (
            <div key={d.date} title={`${fmtDate(d.date)}: ${STATUS_LABEL[d.status]}`} className="text-center">
              <div className={cx('mx-auto h-8 w-full rounded-md', DOT[d.status])} />
              <span className="text-[10px] text-muted">{d.date.slice(8)}/{d.date.slice(5, 7)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Cinza = sem informação · verde = sem dor confirmado · amarelo, laranja e vermelho = dor leve, moderada e intensa.</p>
      </Card>
      {logOpen && <DailyLogModal patientId={me.id} date={today} existing={day.dailyLog} hasAttack={day.attacks.length > 0} onClose={() => setLogOpen(false)} />}
    </div>
  )
}
