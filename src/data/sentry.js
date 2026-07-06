import { fetchCached } from './cache.js'

export async function fetchSentryStatus(des) {
  try {
    const url = `/jpl-ssd/sentry.api?des=${encodeURIComponent(des)}`
    const { data } = await fetchCached(`sentry-${des}`, url, 86400000, true)
    if (data.error || !data.summary) return { listed: false }
    return {
      listed: true,
      impactProb: parseFloat(data.summary.ip),
      torino: data.summary.ts_max,
      palermo: data.summary.ps_max
    }
  } catch {
    return { listed: false }
  }
}
