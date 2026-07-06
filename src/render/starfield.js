import * as THREE from 'three'
import { circleTexture } from './pointTexture.js'

export function createStarfield(count = 2500, radius = 350000, size = radius / 700) {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const rng = mulberry32(42)
  const tmp = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1
    const phi = rng() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    positions[i * 3] = radius * s * Math.cos(phi)
    positions[i * 3 + 1] = radius * u
    positions[i * 3 + 2] = radius * s * Math.sin(phi)
    const warm = rng()
    tmp.setHSL(warm < 0.75 ? 0.58 : 0.75, 0.35, 0.35 + rng() * 0.4)
    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const points = new THREE.Points(geom, new THREE.PointsMaterial({
    size,
    map: circleTexture(),
    alphaTest: 0.05,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false
  }))
  points.frustumCulled = false
  return points
}

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
