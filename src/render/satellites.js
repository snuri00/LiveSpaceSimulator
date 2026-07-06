import * as THREE from 'three'
import { SAT_CATEGORIES, classifySatellite } from '../data/celestrak.js'
import { circleTexture } from './pointTexture.js'

const EARTH_R = 6371

export function createSatelliteLayer() {
  const worker = new Worker(new URL('../astro/sgp4.worker.js', import.meta.url), { type: 'module' })

  let count = 0
  let meta = []
  let basePos = null
  let baseVel = null
  let baseTimeMs = 0
  let pendingPropagation = false
  let geometry = null
  let points = null
  let selectedIndex = -1
  const categoryCounts = {}

  const group = new THREE.Group()

  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: circleTexture(),
    color: 0x57ffc9,
    transparent: true,
    opacity: 0.95,
    depthTest: false
  }))
  marker.visible = false
  group.add(marker)

  const material = new THREE.PointsMaterial({
    size: 78,
    map: circleTexture(),
    alphaTest: 0.05,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1,
    depthWrite: false
  })

  const listeners = { loaded: [], track: [] }

  let orbitLine = null

  function showOrbitLine(pts) {
    removeOrbitLine()
    const positions = new Float32Array(pts.length)
    for (let s = 0; s < pts.length / 3; s++) {
      positions[s * 3] = pts[s * 3]
      positions[s * 3 + 1] = pts[s * 3 + 2]
      positions[s * 3 + 2] = -pts[s * 3 + 1]
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    orbitLine = new THREE.Line(geom, new THREE.LineBasicMaterial({
      color: 0x57ffc9,
      transparent: true,
      opacity: 0.75
    }))
    group.add(orbitLine)
  }

  function removeOrbitLine() {
    if (orbitLine) {
      group.remove(orbitLine)
      orbitLine.geometry.dispose()
      orbitLine = null
    }
  }

  worker.onmessage = (e) => {
    const msg = e.data
    if (msg.type === 'loaded') {
      count = msg.count
      meta = msg.meta
      buildGeometry()
      for (const cb of listeners.loaded) cb({ count, categoryCounts })
    } else if (msg.type === 'state') {
      basePos = msg.pos
      baseVel = msg.vel
      baseTimeMs = msg.timeMs
      pendingPropagation = false
    } else if (msg.type === 'orbit') {
      if (msg.index === selectedIndex) showOrbitLine(msg.pts)
    } else if (msg.type === 'track') {
      for (const cb of listeners.track) cb(msg)
    }
  }

  function buildGeometry() {
    geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const tmp = new THREE.Color()
    for (const c of SAT_CATEGORIES) categoryCounts[c.key] = 0
    for (let i = 0; i < count; i++) {
      const cat = classifySatellite(meta[i].name, meta[i].meanMotion)
      meta[i].category = cat
      categoryCounts[cat]++
      tmp.setHex(SAT_CATEGORIES.find((c) => c.key === cat).color)
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500000)
    points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    group.add(points)
  }

  function load(tleText) {
    worker.postMessage({ type: 'load', tleText })
  }

  function onLoaded(cb) {
    listeners.loaded.push(cb)
  }

  function eciAt(i, simMs, out) {
    if (!basePos) return null
    const dtSec = (simMs - baseTimeMs) / 1000
    const j = i * 3
    const x = basePos[j] + baseVel[j] * dtSec
    const y = basePos[j + 1] + baseVel[j + 1] * dtSec
    const z = basePos[j + 2] + baseVel[j + 2] * dtSec
    if (Number.isNaN(x)) return null
    out.x = x
    out.y = y
    out.z = z
    return out
  }

  const eciTmp = { x: 0, y: 0, z: 0 }

  function getState(i, simMs) {
    if (!eciAt(i, simMs, eciTmp)) return null
    const j = i * 3
    const r = Math.sqrt(eciTmp.x ** 2 + eciTmp.y ** 2 + eciTmp.z ** 2)
    const speed = Math.sqrt(baseVel[j] ** 2 + baseVel[j + 1] ** 2 + baseVel[j + 2] ** 2)
    return { altitudeKm: r - EARTH_R, speedKms: speed, radiusKm: r }
  }

  function selectIndex(i, simMs) {
    selectedIndex = i
    marker.visible = i >= 0
    if (i >= 0) worker.postMessage({ type: 'orbit', index: i, timeMs: simMs ?? Date.now() })
    else removeOrbitLine()
  }

  function requestTrack(i, simMs, spanMin) {
    worker.postMessage({ type: 'track', index: i, timeMs: simMs, spanMin })
  }

  function onTrack(cb) {
    listeners.track.push(cb)
  }

  function findIndex(pred) {
    return meta.findIndex(pred)
  }

  function getScenePosition(i, out) {
    if (geometry && i >= 0 && i < count) {
      const arr = geometry.attributes.position.array
      const j = i * 3
      if (arr[j] < 1e8) {
        out.set(arr[j], arr[j + 1], arr[j + 2])
        return out
      }
    }
    if (!eciAt(i, baseTimeMs, out)) return null
    const y = out.y
    out.y = out.z
    out.z = -y
    return out
  }

  let lastRequestSimMs = 0

  function update(simDate, camera) {
    const simMs = simDate.getTime()
    const needsRefresh = Math.abs(simMs - baseTimeMs) > 30000 || basePos === null
    if (count > 0 && needsRefresh && !pendingPropagation && Math.abs(simMs - lastRequestSimMs) > 500) {
      pendingPropagation = true
      lastRequestSimMs = simMs
      worker.postMessage({ type: 'propagate', timeMs: simMs })
    }
    if (!geometry || !basePos) return
    const dtSec = (simMs - baseTimeMs) / 1000
    const arr = geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      const j = i * 3
      const x = basePos[j] + baseVel[j] * dtSec
      const y = basePos[j + 1] + baseVel[j + 1] * dtSec
      const z = basePos[j + 2] + baseVel[j + 2] * dtSec
      if (Number.isNaN(x)) {
        arr[j] = arr[j + 1] = arr[j + 2] = 1e9
      } else {
        arr[j] = x
        arr[j + 1] = z
        arr[j + 2] = -y
      }
    }
    geometry.attributes.position.needsUpdate = true
    if (selectedIndex >= 0) {
      const j = selectedIndex * 3
      marker.position.set(arr[j], arr[j + 1], arr[j + 2])
      if (camera) {
        const camDist = camera.position.distanceTo(marker.position)
        const pulse = 1 + 0.28 * Math.sin(performance.now() * 0.005)
        marker.scale.setScalar(camDist * 0.014 * pulse)
      }
    }
  }

  return {
    group, load, update, onLoaded, selectIndex, getState,
    requestTrack, onTrack, findIndex, getScenePosition,
    getMeta: () => meta,
    getPoints: () => points
  }
}
