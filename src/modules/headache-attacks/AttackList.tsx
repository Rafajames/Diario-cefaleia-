import { Link } from 'react-router'
import { Badge, Empty } from '@/components/ui'
import { labelOf } from '@/config/clinical-options'
import type { Administration, Attack } from '@/types/database'
import { fmtDateTime, fmtDuration, minutesBetween } from '@/utils/datetime'
import { attackPeak, isAttackIncomplete } from '@/modules/calendar/calc'

const tone = (n: number | null) => (n === null ? 'neutral' : n <= 3 ? 'warn' : n <= 6 ? 'warn' : 'bad') as 'neutral' | 'warn' | 'bad'

/** Lista de crises. Com `linkBase`, cada item abre o registro para edição; sem ele, mostra os detalhes (somente leitura). */
export function AttackList({ attacks, administrations = [], linkBase, empty = 'Nenhuma crise registrada.' }: { attacks: Attack[]; administrations?: Administration[]; linkBase?: string; empty?: string }) {
  if (!attacks.length) return <Empty>{empty}</Empty>
  return (
    <ul className="space-y-2">
      {[...attacks].sort((a, b) => b.started_at.localeCompare(a.started_at)).map((a) => {
        const peak = attackPeak(a)
        const meds = administrations.filter((m) => m.attack_id === a.id)
        const head = (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{fmtDateTime(a.started_at)}{a.start_is_approximate && <span className="font-normal text-muted"> (aprox.)</span>}</p>
              <p className="text-sm text-muted">
                {a.still_ongoing ? 'Em andamento' : a.ended_at ? `Duração: ${fmtDuration(minutesBetween(a.started_at, a.ended_at))}` : 'Término não informado'}
                {a.locations.length > 0 && ` · ${a.locations.map((l) => labelOf('location', l)).join(', ')}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {isAttackIncomplete(a) && <Badge tone="info">Incompleto</Badge>}
              {a.still_ongoing && <Badge tone="warn">Em andamento</Badge>}
              <Badge tone={tone(peak)}>{peak === null ? 'Intensidade não informada' : `Pico ${peak}/10`}</Badge>
            </div>
          </div>
        )
        if (linkBase) return <li key={a.id}><Link to={`${linkBase}/${a.id}`} className="block rounded-lg border border-line bg-card p-3 hover:border-brand">{head}</Link></li>
        return (
          <li key={a.id}>
            <details className="rounded-lg border border-line bg-card p-3">
              <summary>{head}</summary>
              <dl className="mt-3 grid gap-x-4 gap-y-2 border-t border-line pt-3 text-sm sm:grid-cols-2">
                <Item k="Início" v={`${labelOf('', a.onset_type === 'sudden' ? 'Súbito' : a.onset_type === 'gradual' ? 'Gradual' : null)}${a.started_during_sleep === 'yes' ? ' · durante o sono' : ''}`} />
                <Item k="Intensidade (início / pico / término)" v={`${a.intensity_initial ?? '—'} / ${a.intensity_max ?? '—'} / ${a.intensity_final ?? '—'}`} />
                <Item k="Lado" v={labelOf('side', a.side)} />
                <Item k="Características" v={a.pain_qualities.map((q) => labelOf('quality', q)).join(', ') || '—'} />
                <Item k="Agravamento" v={a.aggravating.map((q) => labelOf('aggravating', q)).join(', ') || '—'} />
                <Item k="Sintomas" v={a.symptoms.map((s) => `${labelOf('symptom', s.symptom)} (${labelOf('phase', s.phase).toLowerCase()})`).join(', ') || '—'} />
                <Item k="Possíveis desencadeantes (autorrelato)" v={a.triggers.map((t) => `${labelOf('factor', t.factor)} — ${t.relation === 'suspected' ? 'suspeita' : 'ocorreu antes'}${t.confidence ? `, confiança ${t.confidence}/5` : ''}`).join('; ') || '—'} />
                <Item k="Impacto funcional" v={labelOf('impact', a.functional_impact)} />
                <Item k="Desfecho" v={[a.improved_spontaneously && 'melhora espontânea', a.improved_after_medication && 'melhora após medicação', a.ended_by_sleep && 'interrompida pelo sono'].filter(Boolean).join(', ') || '—'} />
                <Item k="Medicamentos" v={meds.map((m) => `${m.medication_name}${m.dose !== null ? ` ${m.dose} ${m.unit ?? ''}` : ''} (${fmtDateTime(m.taken_at)}${m.outcome ? ` — ${labelOf('outcome', m.outcome).toLowerCase()}` : ''})`).join('; ') || '—'} />
                {a.notes && <Item k="Observações do paciente" v={a.notes} />}
              </dl>
            </details>
          </li>
        )
      })}
    </ul>
  )
}

const Item = ({ k, v }: { k: string; v: string }) => (<div><dt className="text-xs text-muted">{k}</dt><dd>{v}</dd></div>)
