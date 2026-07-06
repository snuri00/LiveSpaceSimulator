import { fetchCached } from './cache.js'

export async function fetchRecentCmes() {
  const apiKey = localStorage.getItem('nasa_api_key') || 'P6HqCaXUjhzBhcFCwEDlSL59B85DKsTOPkYgqiXq'
  const end = new Date().toISOString().slice(0, 10)
  const start = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
  const url = `https://api.nasa.gov/DONKI/CME?startDate=${start}&endDate=${end}&api_key=${apiKey}`
  const { data } = await fetchCached(`donki-cme-${end}`, url, 12 * 3600 * 1000, true)
  const events = []
  for (const ev of data || []) {
    const an = (ev.cmeAnalyses || []).find((a) => a.isMostAccurate) || (ev.cmeAnalyses || [])[0]
    if (!an || !an.time21_5 || !an.speed) continue
    events.push({
      id: ev.activityID,
      t0: Date.parse(an.time21_5),
      lat: an.latitude ?? 0,
      lon: an.longitude ?? 0,
      speed: an.speed,
      half: an.halfAngle || 30,
      earthDirected: Math.abs(an.longitude ?? 180) < 45
    })
  }
  return events
}
