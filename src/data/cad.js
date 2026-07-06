import { fetchCached } from './cache.js'
import { AU_KM, LD_KM } from '../astro/kepler.js'

function isoDay(offsetDays) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10)
}

export async function fetchCloseApproaches() {
  const dmin = isoDay(-30)
  const dmax = isoDay(60)
  const url = `/jpl-ssd/cad.api?dist-max=0.05&date-min=${dmin}&date-max=${dmax}&sort=date`
  const { data, fromCache } = await fetchCached(`cad-${dmin}`, url, 6 * 3600 * 1000, true)
  const idx = {}
  data.fields.forEach((f, i) => (idx[f] = i))
  const rows = (data.data || []).map((r) => {
    const distAu = parseFloat(r[idx.dist])
    const jd = parseFloat(r[idx.jd])
    return {
      des: r[idx.des],
      jd,
      timeMs: (jd - 2440587.5) * 86400000,
      cd: r[idx.cd],
      distAu,
      ld: (distAu * AU_KM) / LD_KM,
      km: distAu * AU_KM,
      vRel: parseFloat(r[idx.v_rel]),
      h: parseFloat(r[idx.h])
    }
  })
  return { rows, fromCache }
}
