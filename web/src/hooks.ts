import { useEffect, useState } from 'react'

/** Retorna o valor após `delayMs` sem mudanças — para não buscar a cada tecla. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

/** Fecha modais com a tecla Escape (acessibilidade keyboard-first do DESIGN.md). */
export function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
}

/** Normaliza texto digitado em campos de overall/potencial: só dígitos, no máximo 99 (o teto real
 *  de um stat do FIFA). Sem isso um input controlado pré-preenchido (ex.: "90") deixa o usuário
 *  digitar em cima sem selecionar tudo antes, concatenando em vez de substituir (ex.: "9091"). */
export function sanitizeStat(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return String(Math.min(99, parseInt(digits, 10)))
}
