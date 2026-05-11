export type SalesHistoryRow = {
  submission_date: string | null
  store_id: string | null
  store_name: string | null
  product_id: string | null
  product_name: string | null
  sku: string | null
  quantity_sent: number | null
  quantity_sold: number | null
  quantity_remaining: number | null
  quantity_returned: number | null
}

export type ShipmentSuggestion = {
  store_id: string
  product_id: string
  store_name: string
  product_name: string
  sku: string
  target_units: number
  min_units: number
  max_units: number
  current_avg_sent: number
  avg_sold: number
  avg_remaining: number
  return_rate: number
  action: 'increase' | 'decrease' | 'hold'
  delta_units: number
}

function roundUnits(value: number) {
  return Math.max(0, Math.round(value))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function buildShipmentSuggestions(rows: SalesHistoryRow[], targetDate = new Date()): ShipmentSuggestion[] {
  const targetWeekday = targetDate.getDay()
  const grouped = new Map<string, SalesHistoryRow[]>()

  rows.forEach((row) => {
    if (!row.store_id || !row.product_id || !row.store_name || !row.product_name) return
    const key = `${row.store_id}::${row.product_id}`
    const bucket = grouped.get(key) ?? []
    bucket.push(row)
    grouped.set(key, bucket)
  })

  return Array.from(grouped.entries())
    .map(([key, bucket]) => {
      const [store_id, product_id] = key.split('::')
      const dated = bucket.filter((row) => row.submission_date)
      if (!dated.length) return null

      let recentWeight = 0
      let sentWeighted = 0
      let soldWeighted = 0
      let remainingWeighted = 0
      let returnedWeighted = 0
      let sameDayCount = 0
      let sameDaySold = 0
      let maxObservedSent = 0

      dated.forEach((row, index) => {
        const date = new Date(row.submission_date as string)
        const sameWeekday = date.getDay() === targetWeekday
        const recencyWeight = Math.max(1, dated.length - index)
        const weekdayWeight = sameWeekday ? 2.4 : 1
        const weight = recencyWeight * weekdayWeight

        recentWeight += weight
        sentWeighted += (row.quantity_sent ?? 0) * weight
        soldWeighted += (row.quantity_sold ?? 0) * weight
        remainingWeighted += (row.quantity_remaining ?? 0) * weight
        returnedWeighted += (row.quantity_returned ?? 0) * weight
        maxObservedSent = Math.max(maxObservedSent, row.quantity_sent ?? 0)

        if (sameWeekday) {
          sameDayCount += 1
          sameDaySold += row.quantity_sold ?? 0
        }
      })

      const avgSent = recentWeight > 0 ? sentWeighted / recentWeight : 0
      const avgSold = recentWeight > 0 ? soldWeighted / recentWeight : 0
      const avgRemaining = recentWeight > 0 ? remainingWeighted / recentWeight : 0
      const returnRate = sentWeighted > 0 ? returnedWeighted / sentWeighted : 0
      const weekdayBoost = sameDayCount > 0 ? sameDaySold / sameDayCount : avgSold

      let target = avgSold * 0.65 + weekdayBoost * 0.35
      target += avgRemaining <= 1 ? 1 : 0
      target -= returnRate > 0.15 ? 2 : 0
      target -= avgRemaining >= 3 ? 1 : 0

      const minUnits = roundUnits(Math.max(0, target - 2))
      const maxUnits = roundUnits(Math.max(minUnits, maxObservedSent + 4))
      const targetUnits = clamp(roundUnits(target), minUnits, maxUnits)
      const delta = targetUnits - roundUnits(avgSent)

      let action: 'increase' | 'decrease' | 'hold' = 'hold'
      if (delta >= 2) action = 'increase'
      if (delta <= -2) action = 'decrease'

      return {
        store_id,
        product_id,
        store_name: dated[0].store_name as string,
        product_name: dated[0].product_name as string,
        sku: dated[0].sku ?? '-',
        target_units: targetUnits,
        min_units: minUnits,
        max_units: maxUnits,
        current_avg_sent: roundUnits(avgSent),
        avg_sold: roundUnits(avgSold),
        avg_remaining: roundUnits(avgRemaining),
        return_rate: returnRate,
        action,
        delta_units: Math.abs(delta),
      }
    })
    .filter((row): row is ShipmentSuggestion => Boolean(row))
}

