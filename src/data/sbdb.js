import { fetchCached } from './cache.js'

export async function fetchOrbitElements(des) {
  const url = `/jpl-ssd/sbdb.api?des=${encodeURIComponent(des)}`
  const { data } = await fetchCached(`sbdb-${des}`, url, 7 * 86400000, true)
  const els = {}
  for (const e of data.orbit?.elements || []) els[e.name] = parseFloat(e.value)
  if (!Number.isFinite(els.a)) throw new Error(`SBDB: no elements for ${des}`)
  return {
    des,
    fullname: (data.object?.fullname || des).trim(),
    orbitClass: data.object?.orbit_class?.name || '',
    orbitClassCode: data.object?.orbit_class?.code || '',
    neo: !!data.object?.neo,
    pha: !!data.object?.pha,
    a: els.a,
    e: els.e,
    i: els.i,
    om: els.om,
    w: els.w,
    ma: els.ma,
    n: els.n,
    per: els.per,
    moid: parseFloat(data.orbit?.moid ?? els.moid),
    epoch: parseFloat(data.orbit?.epoch)
  }
}
