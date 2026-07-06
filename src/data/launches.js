import { fetchCached } from './cache.js'

export async function fetchNextLaunches() {
  const url = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=4&mode=list&hide_recent_previous=true'
  const { data } = await fetchCached('ll2-upcoming', url, 3 * 3600 * 1000, true)
  return (data.results || []).map((l) => ({
    name: l.name,
    netMs: Date.parse(l.net),
    status: l.status?.abbrev || ''
  })).filter((l) => Number.isFinite(l.netMs))
}
