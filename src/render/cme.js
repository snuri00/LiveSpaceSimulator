import * as THREE from 'three'
import { DEG, AU_KM, jdFromDate } from '../astro/kepler.js'
import { earthPosition } from '../astro/planets.js'
import { circleTexture } from './pointTexture.js'

const PARTICLES_PER_CME = 160
const MAX_AU = 3.2

function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createCmeLayer(unitsPerAu) {
  const group = new THREE.Group()
  let dirs = null
  let jitters = null
  let starts = null
  let speeds = null
  let count = 0
  let geometry = null

  function load(events) {
    const recent = events.slice(-24)
    count = recent.length * PARTICLES_PER_CME
    if (!count) return
    dirs = new Float32Array(count * 3)
    jitters = new Float32Array(count)
    starts = new Float64Array(count)
    speeds = new Float32Array(count)
    let p = 0
    for (let evIdx = 0; evIdx < recent.length; evIdx++) {
      const ev = recent[evIdx]
      const rng = mulberry32(evIdx * 7919 + 17)
      const jd0 = ev.t0 / 86400000 + 2440587.5
      const [ex, ey] = earthPosition(jd0)
      const earthLon = Math.atan2(ey, ex)
      const lon = earthLon + ev.lon * DEG
      const lat = ev.lat * DEG
      const half = ev.half * DEG
      for (let k = 0; k < PARTICLES_PER_CME; k++) {
        const spread = Math.sqrt(rng()) * half
        const az = rng() * Math.PI * 2
        const dLat = lat + spread * Math.sin(az)
        const dLon = lon + (spread * Math.cos(az)) / Math.max(0.2, Math.cos(lat))
        dirs[p * 3] = Math.cos(dLat) * Math.cos(dLon)
        dirs[p * 3 + 1] = Math.cos(dLat) * Math.sin(dLon)
        dirs[p * 3 + 2] = Math.sin(dLat)
        jitters[p] = 0.75 + rng() * 0.5
        starts[p] = ev.t0
        speeds[p] = ev.speed
        p++
      }
    }
    geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), unitsPerAu * MAX_AU * 2)
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xff8ac2,
      size: 11,
      map: circleTexture(),
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }))
    points.frustumCulled = false
    group.add(points)
  }

  function update(simDate) {
    if (!geometry) return
    const simMs = simDate.getTime()
    const arr = geometry.attributes.position.array
    for (let p = 0; p < count; p++) {
      const ageSec = (simMs - starts[p]) / 1000
      const distAu = (ageSec * speeds[p] * jitters[p]) / AU_KM
      const j = p * 3
      if (ageSec < 0 || distAu > MAX_AU) {
        arr[j] = arr[j + 1] = arr[j + 2] = 1e9
        continue
      }
      const r = distAu * unitsPerAu
      arr[j] = dirs[j] * r
      arr[j + 1] = dirs[j + 2] * r
      arr[j + 2] = -dirs[j + 1] * r
    }
    geometry.attributes.position.needsUpdate = true
  }

  return { group, load, update }
}
