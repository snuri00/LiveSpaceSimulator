import { fetchCached } from './cache.js'

const GP_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'
const TTL_MS = 6 * 3600 * 1000

function looksLikeTle(text) {
  return typeof text === 'string' && /\n1 /.test(text)
}

export async function fetchActiveSatellites() {
  try {
    const result = await fetchCached('celestrak-active-tle', GP_URL, TTL_MS, false)
    if (looksLikeTle(result.data)) return result
  } catch {}
  const res = await fetch(`${import.meta.env.BASE_URL}data/tle-snapshot.txt`)
  return { data: await res.text(), fromCache: true, snapshot: true }
}

export const SAT_CATEGORIES = [
  { key: 'STARLINK', label: 'STARLINK', color: 0x4fd8ff },
  { key: 'ONEWEB', label: 'ONEWEB', color: 0x6b8cff },
  { key: 'WEATHER', label: 'WEATHER', color: 0xe8f4ff },
  { key: 'GNSS', label: 'GPS / GNSS', color: 0x57ffc9 },
  { key: 'GEO', label: 'GEO BELT', color: 0x9d7bff },
  { key: 'ISS', label: 'ISS', color: 0x57ffc9 },
  { key: 'OTHER', label: 'OTHER', color: 0x5a7391 }
]

const GNSS_RE = /\b(GPS|NAVSTAR|GLONASS|GALILEO|BEIDOU|IRNSS|NVS|QZS)/
const WEATHER_RE = /\b(NOAA|GOES|METEOSAT|MTG-|HIMAWARI|METOP|FENGYUN|FY-|DMSP|ELEKTRO|INSAT-3D)/

export function classifySatellite(name, meanMotionRevPerDay) {
  if (name.startsWith('ISS (ZARYA)')) return 'ISS'
  if (name.startsWith('STARLINK')) return 'STARLINK'
  if (name.startsWith('ONEWEB')) return 'ONEWEB'
  if (GNSS_RE.test(name)) return 'GNSS'
  if (WEATHER_RE.test(name)) return 'WEATHER'
  if (Math.abs(meanMotionRevPerDay - 1.0027) < 0.02) return 'GEO'
  return 'OTHER'
}
