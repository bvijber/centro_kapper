export function parseEuroToCents(value: string): number | null {
  const v = value.trim().replace(/\s+/g, '')
  if (!v) return null
  if (!/^\d+([.,]\d{1,2})?$/.test(v)) return null
  const [whole, frac = ''] = v.split(/[.,]/)
  const wholeNum = Number(whole)
  const fracNum = Number(frac.padEnd(2, '0'))
  if (!Number.isSafeInteger(wholeNum) || !Number.isSafeInteger(fracNum)) return null
  const cents = wholeNum * 100 + fracNum
  if (!Number.isSafeInteger(cents) || cents < 0) return null
  return cents
}

export function formatCentsAsEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}