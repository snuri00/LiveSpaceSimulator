import { solveKepler, orbitalToEcliptic, DEG, TWO_PI } from './kepler.js'

const TABLE = {
  mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593,
    0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  venus: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255,
    0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
  earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
    0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  mars: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
    0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
    -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
    -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  uranus: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503,
    -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574,
    0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]
}

export const PLANETS = [
  { key: 'mercury', label: 'MERCURY', color: 0x9db4d8, size: 14 },
  { key: 'venus', label: 'VENUS', color: 0xbfd8ff, size: 22 },
  { key: 'earth', label: 'EARTH', color: 0x4fd8ff, size: 24 },
  { key: 'mars', label: 'MARS', color: 0xff8a9e, size: 18 },
  { key: 'jupiter', label: 'JUPITER', color: 0xd8e6ff, size: 46 },
  { key: 'saturn', label: 'SATURN', color: 0xc4d4f0, size: 40 },
  { key: 'uranus', label: 'URANUS', color: 0x8ff0e8, size: 30 },
  { key: 'neptune', label: 'NEPTUNE', color: 0x6b8cff, size: 30 }
]

function computedElements(key, jd) {
  const T = (jd - 2451545) / 36525
  const [a0, e0, I0, L0, wb0, om0, da, de, dI, dL, dwb, dom] = TABLE[key]
  return {
    a: a0 + da * T,
    e: e0 + de * T,
    I: I0 + dI * T,
    L: L0 + dL * T,
    wb: wb0 + dwb * T,
    om: om0 + dom * T
  }
}

export function planetPosition(key, jd) {
  const { a, e, I, L, wb, om } = computedElements(key, jd)
  const w = wb - om
  let M = ((L - wb) * DEG) % TWO_PI
  if (M < 0) M += TWO_PI
  const E = solveKepler(M, e)
  return orbitalToEcliptic(a, e, I * DEG, om * DEG, w * DEG, E)
}

export function samplePlanetOrbit(key, jd, segments = 256) {
  const { a, e, I, wb, om } = computedElements(key, jd)
  const w = wb - om
  const pts = []
  for (let s = 0; s <= segments; s++) {
    const E = solveKepler((s / segments) * TWO_PI, e)
    pts.push(orbitalToEcliptic(a, e, I * DEG, om * DEG, w * DEG, E))
  }
  return pts
}

export function earthPosition(jd) {
  return planetPosition('earth', jd)
}

export function moonGeoEclipticKm(jd) {
  const d = jd - 2451545
  const L = (218.316 + 13.176396 * d) * DEG
  const M = (134.963 + 13.064993 * d) * DEG
  const F = (93.272 + 13.229350 * d) * DEG
  const lon = L + 6.289 * DEG * Math.sin(M)
  const lat = 5.128 * DEG * Math.sin(F)
  const r = 385001 - 20905 * Math.cos(M)
  return [
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.cos(lat) * Math.sin(lon),
    r * Math.sin(lat)
  ]
}
