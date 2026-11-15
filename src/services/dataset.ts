import { useQuery } from '@tanstack/react-query'
import type { Administration, Assessment, Attack, DailyLog, Dataset, DateOnly, MenstrualCycle } from '@/types/database'
import { addDays } from '@/utils/datetime'
import { supabase, unwrap } from './supabase'

/**
 * Carrega o conjunto de dados de um paciente para um intervalo de datas.
 * Inclui folga antes do início para crises/ciclos que começaram antes e alcançam o período.
 */
export async function fetchDataset(patientId: string, from: DateOnly, to: DateOnly, opts: { menstruation?: boolean; marginDays?: number } = {}): Promise<Dataset> {
  const start = addDays(from, -(opts.marginDays ?? 31))
  const end = `${addDays(to, 1)}T23:59:59`
  const sb = supabase()
  const [attacks, administrations, dailyLogs, cycles] = await Promise.all([
    unwrap<Attack[]>(sb.from('headache_attacks').select('*').eq('patient_id', patientId).is('deleted_at', null).gte('started_at', start).lte('started_at', end).order('started_at')),
    unwrap<Administration[]>(sb.from('medication_administrations').select('*').eq('patient_id', patientId).gte('taken_at', start).lte('taken_at', end).order('taken_at')),
    unwrap<DailyLog[]>(sb.from('daily_logs').select('*').eq('patient_id', patientId).gte('log_date', start).lte('log_date', to).order('log_date')),
    opts.menstruation === false
      ? Promise.resolve([] as MenstrualCycle[])
      : unwrap<MenstrualCycle[]>(sb.from('menstrual_cycles').select('*').eq('patient_id', patientId).gte('start_date', addDays(start, -15)).lte('start_date', addDays(to, 5)).order('start_date')),
  ])
  const ids = attacks.map((a) => a.id)
  const assessments = ids.length
    ? await unwrap<Assessment[]>(sb.from('attack_assessments').select('*').in('attack_id', ids).order('assessed_at'))
    : []
  return { attacks, assessments, administrations, dailyLogs, cycles }
}

export function useDataset(patientId: string, from: DateOnly, to: DateOnly, opts: { menstruation?: boolean; marginDays?: number } = {}) {
  return useQuery({
    queryKey: ['dataset', patientId, from, to, opts.menstruation !== false, opts.marginDays ?? 31],
    queryFn: () => fetchDataset(patientId, from, to, opts),
  })
}
