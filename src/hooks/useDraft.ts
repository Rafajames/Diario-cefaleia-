import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { friendlyError } from '@/utils/errors'

/** Estado de um formulário pequeno (modais). */
export function useDraft<T extends object>(initial: T) {
  const [v, setV] = useState<T>(initial)
  const set = useCallback(<K extends keyof T>(k: K, value: T[K]) => setV((p) => ({ ...p, [k]: value })), [])
  return { v, set, setV }
}

/**
 * Executa uma ação de escrita com estado de carregamento/erro e, ao concluir,
 * invalida as consultas em cache para que todas as telas reflitam o novo dado.
 */
export function useAction() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const run = useCallback(async (fn: () => Promise<unknown>, onDone?: () => void) => {
    setBusy(true); setError(''); setFields({})
    try {
      await fn()
      await qc.invalidateQueries()
      onDone?.()
      return true
    } catch (e) {
      const issues = (e as { issues?: { path: string; message: string }[] }).issues
      if (issues) setFields(Object.fromEntries(issues.map((i) => [i.path, i.message])))
      setError(friendlyError(e))
      return false
    } finally { setBusy(false) }
  }, [qc])
  return { run, busy, error, fields, clear: () => { setError(''); setFields({}) } }
}
