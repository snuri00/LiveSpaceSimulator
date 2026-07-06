export const AU_KM = 149597870.7
export const LD_KM = 384399
export const DEG = Math.PI / 180
export const TWO_PI = Math.PI * 2

export function jdFromDate(date) {
  return date.getTime() / 86400000 + 2440587.5
}

export function dateFromJd(jd) {
  return new Date((jd - 2440587.5) * 86400000)
}

export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI
  for (let k = 0; k < 20; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-9) break
  }
  return E
}

export function orbitalToEcliptic(a, e, iRad, omRad, wRad, E) {
  const xv = a * (Math.cos(E) - e)
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const cw = Math.cos(wRad), sw = Math.sin(wRad)
  const co = Math.cos(omRad), so = Math.sin(omRad)
  const ci = Math.cos(iRad), si = Math.sin(iRad)
  return [
    (cw * co - sw * so * ci) * xv + (-sw * co - cw * so * ci) * yv,
    (cw * so + sw * co * ci) * xv + (-sw * so + cw * co * ci) * yv,
    sw * si * xv + cw * si * yv
  ]
}

export function elementsToPosition(el, jd) {
  const n = el.n ?? 0.9856076686 / Math.pow(el.a, 1.5)
  let M = ((el.ma + n * (jd - el.epoch)) * DEG) % TWO_PI
  if (M < 0) M += TWO_PI
  const E = solveKepler(M, el.e)
  return orbitalToEcliptic(el.a, el.e, el.i * DEG, el.om * DEG, el.w * DEG, E)
}

export function sampleOrbit(el, segments = 256) {
  const pts = []
  for (let s = 0; s <= segments; s++) {
    const E = solveKepler((s / segments) * TWO_PI, el.e)
    pts.push(orbitalToEcliptic(el.a, el.e, el.i * DEG, el.om * DEG, el.w * DEG, E))
  }
  return pts
}

const OBLIQUITY = 23.43928 * DEG

export function eclipticToEquatorial(x, y, z) {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY)
  return [x, y * c - z * s, y * s + z * c]
}
