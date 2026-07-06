import { fetchCached } from './cache.js'

function apiKey() {
  return localStorage.getItem('nasa_api_key') || 'P6HqCaXUjhzBhcFCwEDlSL59B85DKsTOPkYgqiXq'
}

function isoDay(offsetDays) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10)
}

export async function fetchFlares() {
  const end = isoDay(0)
  const url = `https://api.nasa.gov/DONKI/FLR?startDate=${isoDay(-7)}&endDate=${end}&api_key=${apiKey()}`
  const { data } = await fetchCached(`donki-flr-${end}`, url, 12 * 3600 * 1000, true)
  const flares = (data || []).map((f) => f.classType).filter(Boolean)
  const order = { A: 0, B: 1, C: 2, M: 3, X: 4 }
  let max = null
  for (const c of flares) {
    if (!max || (order[c[0]] ?? -1) > (order[max[0]] ?? -1) ||
      ((c[0] === max[0]) && parseFloat(c.slice(1)) > parseFloat(max.slice(1)))) max = c
  }
  return { count: flares.length, maxClass: max }
}

export async function fetchStorms() {
  const end = isoDay(0)
  const url = `https://api.nasa.gov/DONKI/GST?startDate=${isoDay(-3)}&endDate=${end}&api_key=${apiKey()}`
  const { data } = await fetchCached(`donki-gst-${end}`, url, 6 * 3600 * 1000, true)
  let maxKp = 0
  for (const g of data || []) {
    for (const k of g.allKpIndex || []) {
      if (Date.now() - Date.parse(k.observedTime) < 48 * 3600 * 1000) maxKp = Math.max(maxKp, k.kpIndex)
    }
  }
  const gLevel = maxKp >= 5 ? 'G' + Math.min(5, Math.floor(maxKp) - 4) : null
  return { maxKp, gLevel }
}

export async function fetchKpNow() {
  const url = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'
  const { data } = await fetchCached('swpc-kp', url, 30 * 60 * 1000, true)
  const last = data[data.length - 1]
  const kp = typeof last?.Kp === 'number' ? last.Kp : parseFloat(last?.[1])
  if (!Number.isFinite(kp)) throw new Error('SWPC: unexpected Kp format')
  return { kp, time: last.time_tag ?? last[0] }
}
