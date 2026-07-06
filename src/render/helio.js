import * as THREE from 'three'
import { PLANETS, planetPosition, samplePlanetOrbit } from '../astro/planets.js'
import { sampleOrbit, elementsToPosition, jdFromDate } from '../astro/kepler.js'
import { createStarfield } from './starfield.js'
import { createCmeLayer } from './cme.js'

export const UNITS_PER_AU = 1000

function toScene(p, scale = UNITS_PER_AU) {
  return new THREE.Vector3(p[0] * scale, p[2] * scale, -p[1] * scale)
}

let neoGlowTex = null
function neoGlow() {
  if (neoGlowTex) return neoGlowTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.3, 'rgba(255,140,190,0.5)')
  g.addColorStop(1, 'rgba(255,140,190,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  neoGlowTex = new THREE.CanvasTexture(c)
  return neoGlowTex
}

function makeGlowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255, 240, 210, 1)')
  g.addColorStop(0.25, 'rgba(255, 220, 160, 0.55)')
  g.addColorStop(1, 'rgba(255, 200, 120, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

export function createHelioContent(scene, labelGroup) {
  const starFallback = createStarfield(2200, 90000)
  scene.add(starFallback)

  const sunMat = new THREE.ShaderMaterial({
    uniforms: { sunTex: { value: null }, hasTex: { value: 0 }, time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D sunTex;
      uniform float hasTex;
      uniform float time;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(vNormal, vView)), 1.5);
        vec3 base = vec3(1.0, 0.86, 0.55);
        if (hasTex > 0.5) {
          vec3 tex = texture2D(sunTex, vUv).rgb;
          float lum = dot(tex, vec3(0.5, 0.4, 0.25));
          base = mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 0.95, 0.75), lum * 1.6);
        }
        vec3 col = base + vec3(1.0, 0.6, 0.2) * rim * 0.7;
        gl_FragColor = vec4(col, 1.0);
      }
    `
  })
  const sun = new THREE.Mesh(new THREE.SphereGeometry(52, 48, 48), sunMat)
  scene.add(sun)

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }))
  glow.scale.setScalar(420)
  scene.add(glow)

  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: 0xffb060,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }))
  corona.scale.setScalar(680)
  scene.add(corona)
  labelGroup.add('SOL', '#ffe9b8', (v) => v.set(0, -80, 0), 'faint')

  function setSunTexture(tex) {
    sunMat.uniforms.sunTex.value = tex
    sunMat.uniforms.hasTex.value = 1
  }

  const nowJd = jdFromDate(new Date())
  const planetMeshes = []
  for (const p of PLANETS) {
    const pts = samplePlanetOrbit(p.key, nowJd).map((q) => toScene(q))
    const orbit = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: p.key === 'earth' ? 0x4fd8ff : 0x35548a,
        transparent: true,
        opacity: p.key === 'earth' ? 0.9 : 0.55
      })
    )
    scene.add(orbit)
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.size, 24, 24),
      new THREE.MeshBasicMaterial({ color: p.color })
    )
    if (p.key === 'saturn') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(p.size * 1.4, p.size * 2.3, 64),
        new THREE.MeshBasicMaterial({ color: 0xd8c89a, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
      )
      ring.rotation.x = Math.PI / 2.2
      mesh.add(ring)
    }
    if (p.key === 'uranus') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(p.size * 1.5, p.size * 1.9, 48),
        new THREE.MeshBasicMaterial({ color: 0x8ff0e8, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })
      )
      ring.rotation.y = Math.PI / 2.4
      mesh.add(ring)
    }
    scene.add(mesh)
    labelGroup.add(p.label, '#a8d8ff', (v) => mesh.getWorldPosition(v), 'faint')
    planetMeshes.push({ ...p, mesh })
  }

  const neoEntries = new Map()

  function addNeoOrbit(des, elements) {
    if (neoEntries.has(des)) return
    const pts = sampleOrbit(elements, 200).map((q) => toScene(q))
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xff5c8a, transparent: true, opacity: 0.35 })
    )
    scene.add(line)
    const marker = new THREE.Group()
    const wire = new THREE.Mesh(
      new THREE.OctahedronGeometry(1),
      new THREE.MeshBasicMaterial({ color: 0xff8aa8, wireframe: true, transparent: true, opacity: 0.95 })
    )
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: neoGlow(),
      color: 0xff5c8a,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }))
    glow.scale.setScalar(3.2)
    marker.add(wire, glow)
    scene.add(marker)
    const label = labelGroup.add(des, '#ff5c8a', (v) => marker.getWorldPosition(v), 'faint')
    label.setVisible(false)
    neoEntries.set(des, { line, marker, wire, glow, label, elements, selected: false })
  }

  function selectNeo(des) {
    for (const [key, e] of neoEntries) {
      e.selected = key === des
      e.line.material.color.setHex(e.selected ? 0x57ffc9 : 0xff5c8a)
      e.line.material.opacity = e.selected ? 1 : 0.35
      e.wire.material.color.setHex(e.selected ? 0x57ffc9 : 0xff8aa8)
      e.glow.material.color.setHex(e.selected ? 0x57ffc9 : 0xff5c8a)
      e.label.setVisible(e.selected)
      e.label.setClass(e.selected ? 'big' : 'faint')
    }
  }

  const craftMarkers = []

  function addCraftMarker(label, vecAu) {
    const r = Math.sqrt(vecAu.x ** 2 + vecAu.y ** 2 + vecAu.z ** 2)
    if (r > 42) return
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(14),
      new THREE.MeshBasicMaterial({ color: 0x57ffc9, wireframe: true })
    )
    marker.position.copy(toScene([vecAu.x, vecAu.y, vecAu.z]))
    scene.add(marker)
    labelGroup.add('◆ ' + label, '#57ffc9', (v) => marker.getWorldPosition(v))
    craftMarkers.push(marker)
  }

  const cme = createCmeLayer(UNITS_PER_AU)
  scene.add(cme.group)

  function replaceStars(starPoints) {
    scene.remove(starFallback)
    scene.add(starPoints)
  }

  function getSelectedNeoWorldPos(out) {
    for (const e of neoEntries.values()) {
      if (e.selected) return e.marker.getWorldPosition(out)
    }
    return null
  }

  const tmp = new THREE.Vector3()

  function update(simDate, camera, tSec = 0) {
    const jd = jdFromDate(simDate)
    sunMat.uniforms.time.value = tSec
    sun.rotation.y = tSec * 0.02
    corona.scale.setScalar(680 + Math.sin(tSec * 0.7) * 30)
    for (const p of planetMeshes) {
      const pos = toScene(planetPosition(p.key, jd))
      p.mesh.position.copy(pos)
    }
    for (const e of neoEntries.values()) {
      tmp.copy(toScene(elementsToPosition(e.elements, jd)))
      e.marker.position.copy(tmp)
      if (camera) {
        const camDist = camera.position.distanceTo(tmp)
        const s = Math.min(28, Math.max(2.4, camDist * 0.011)) * (e.selected ? 1.7 : 1)
        e.wire.scale.setScalar(s)
        e.glow.scale.setScalar(s * 3.2)
        const fade = Math.min(1, Math.max(0.15, (camDist - s * 1.5) / (s * 4)))
        e.wire.material.opacity = (e.selected ? 1 : 0.9) * fade
        e.glow.material.opacity = (e.selected ? 0.75 : 0.5) * fade
      }
    }
    cme.update(simDate)
  }

  return { update, addNeoOrbit, selectNeo, addCraftMarker, loadCmes: cme.load, replaceStars, setSunTexture, getSelectedNeoWorldPos }
}
