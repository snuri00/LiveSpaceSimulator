import { fetchCached } from './cache.js'

export async function fetchCraftVectorAu(horizonsId, jd) {
  const day = Math.floor(jd)
  const url = `/jpl-horizons/api/horizons.api?format=json&COMMAND='${horizonsId}'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='VECTORS'&CENTER='500@10'&TLIST='${jd.toFixed(3)}'&REF_PLANE='ECLIPTIC'&VEC_TABLE='2'&OUT_UNITS='AU-D'&CSV_FORMAT='YES'`
  const { data } = await fetchCached(`horizons-${horizonsId}-${day}`, url, 12 * 3600 * 1000, true)
  const text = data.result || ''
  const block = text.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!block) throw new Error(`Horizons: no vector for ${horizonsId}`)
  const parts = block.trim().split('\n')[0].split(',').map((s) => s.trim())
  const x = parseFloat(parts[2])
  const y = parseFloat(parts[3])
  const z = parseFloat(parts[4])
  if (!Number.isFinite(x)) throw new Error(`Horizons: parse failure for ${horizonsId}`)
  return { x, y, z, rangeAu: Math.sqrt(x * x + y * y + z * z) }
}
