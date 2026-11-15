import { describe, expect, it } from 'vitest'
import { analyzeMenstrualAssociation, inPerimenstrualWindow, phaseOf } from '@/modules/menstruation/calc'
import { adm, attack, cycle } from './factories'

const w = { days_before: 2, days_after: 2, min_cycles: 3, min_positive: 2 }
const today = '2026-06-30'
const closed = (start: string, max = 6) => attack(`${start}T08:00`, { ended_at: `${start}T12:00`, intensity_max: max })

describe('ciclo menstrual', () => {
  it('janela perimenstrual padrão cobre os dias −2 a +3 (dia +1 = início)', () => {
    const c = cycle('2026-03-10', '2026-03-14')
    expect(inPerimenstrualWindow('2026-03-07', c, w)).toBe(false)
    expect(inPerimenstrualWindow('2026-03-08', c, w)).toBe(true) // dia −2
    expect(inPerimenstrualWindow('2026-03-10', c, w)).toBe(true) // dia +1
    expect(inPerimenstrualWindow('2026-03-12', c, w)).toBe(true) // dia +3
    expect(inPerimenstrualWindow('2026-03-13', c, w)).toBe(false)
  })

  it('classifica a fase de cada dia', () => {
    const cs = [cycle('2026-03-10', '2026-03-14')]
    expect(phaseOf('2026-03-09', cs, w)).toBe('pre')
    expect(phaseOf('2026-03-12', cs, w)).toBe('bleeding')
    expect(phaseOf('2026-03-15', cs, w)).toBe('post')
    expect(phaseOf('2026-03-20', cs, w)).toBe('other')
  })

  it('possível padrão: cefaleia na janela em 2 de 3 ciclos', () => {
    const cs = [cycle('2026-03-10', '2026-03-14'), cycle('2026-04-08', '2026-04-12'), cycle('2026-05-06', '2026-05-10')]
    const r = analyzeMenstrualAssociation(cs, [closed('2026-03-09'), closed('2026-05-07'), closed('2026-04-20')], [], w, today)
    expect(r.evaluatedCycles).toBe(3)
    expect(r.positiveCycles).toBe(2)
    expect(r.pattern).toBe('possible_pattern')
    expect(r.note).toContain('não é um diagnóstico')
  })

  it('1 de 3 ciclos não caracteriza padrão', () => {
    const cs = [cycle('2026-03-10', '2026-03-14'), cycle('2026-04-08', '2026-04-12'), cycle('2026-05-06', '2026-05-10')]
    expect(analyzeMenstrualAssociation(cs, [closed('2026-03-09')], [], w, today).pattern).toBe('not_observed')
  })

  it('menos de 3 ciclos: dados insuficientes', () => {
    const cs = [cycle('2026-03-10', '2026-03-14'), cycle('2026-04-08')]
    const r = analyzeMenstrualAssociation(cs, [closed('2026-03-10'), closed('2026-04-08')], [], w, today)
    expect(r.pattern).toBe('insufficient_data')
  })

  it('ciclo incompleto (sem fim) é aceito e sinalizado', () => {
    const r = analyzeMenstrualAssociation([cycle('2026-03-10')], [closed('2026-03-11')], [], w, today)
    expect(r.cycles[0].incomplete).toBe(true)
    expect(r.cycles[0].hadHeadacheInWindow).toBe(true)
    expect(r.headacheDaysByPhase.other).toBe(1) // sem data de fim, só o 1º dia é contado como sangramento
  })

  it('janela ainda em andamento não entra na avaliação', () => {
    const cs = [cycle('2026-04-08', '2026-04-12'), cycle('2026-05-06', '2026-05-10'), cycle('2026-06-29')]
    expect(analyzeMenstrualAssociation(cs, [], [], w, today).evaluatedCycles).toBe(2)
  })

  it('cruza dias de cefaleia, intensidade e resposta por fase', () => {
    const cs = [cycle('2026-03-10', '2026-03-12')]
    const a1 = closed('2026-03-11', 8), a2 = closed('2026-03-25', 4)
    const r = analyzeMenstrualAssociation(cs, [a1, a2, closed('2026-03-09', 6), closed('2026-03-13', 5)], [
      adm('2026-03-11T09:00', { attack_id: a1.id, outcome: 'partial' }),
      adm('2026-03-25T09:00', { attack_id: a2.id, outcome: 'complete' }),
    ], w, today)
    expect(r.headacheDaysByPhase).toEqual({ pre: 1, bleeding: 1, post: 1, other: 1 })
    expect(r.peakIntensityByPhase.bleeding.mean).toBe(8)
    expect(r.peakIntensityByPhase.other.mean).toBe(4)
    expect(r.completeReliefByPhase.bleeding).toEqual({ reported: 1, complete: 0 })
    expect(r.completeReliefByPhase.other).toEqual({ reported: 1, complete: 1 })
  })

  it('crise que atravessa dias conta em cada fase que cobre', () => {
    const multi = attack('2026-03-09T20:00', { ended_at: '2026-03-10T10:00', intensity_max: 7 })
    const r = analyzeMenstrualAssociation([cycle('2026-03-10', '2026-03-12')], [multi], [], w, today)
    expect(r.headacheDaysByPhase.pre).toBe(1)
    expect(r.headacheDaysByPhase.bleeding).toBe(1)
  })
})
