import * as satellite from 'satellite.js'

export const EARTH_RADIUS_KM = 6371

export function gmstRad(date) {
  return satellite.gstime(date)
}

export function eciToScene(v, out) {
  out.set(v.x, v.z, -v.y)
  return out
}
