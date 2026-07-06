import * as THREE from 'three'
import { elementsToPosition, eclipticToEquatorial, AU_KM } from '../astro/kepler.js'
import { earthPosition } from '../astro/planets.js'

const SPAN_DAYS = 5
const STEPS = 120

function geoVectorKm(elements, jd, out) {
  const [ax, ay, az] = elementsToPosition(elements, jd)
  const [ex, ey, ez] = earthPosition(jd)
  const [qx, qy, qz] = eclipticToEquatorial((ax - ex) * AU_KM, (ay - ey) * AU_KM, (az - ez) * AU_KM)
  out.set(qx, qz, -qy)
  return out
}

export function createGeoTrajectories(labelGroup) {
  const group = new THREE.Group()
  const entries = new Map()
  const tmp = new THREE.Vector3()

  function add(des, elements, caJd) {
    if (entries.has(des)) return
    const pts = []
    for (let s = 0; s <= STEPS; s++) {
      const jd = caJd - SPAN_DAYS + (s / STEPS) * SPAN_DAYS * 2
      pts.push(geoVectorKm(elements, jd, new THREE.Vector3()).clone())
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xff5c8a, transparent: true, opacity: 0.4 })
    )
    group.add(line)

    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(28000),
      new THREE.MeshBasicMaterial({ color: 0xff5c8a, wireframe: true })
    )
    marker.visible = false
    group.add(marker)

    const label = labelGroup.add(des, '#ff5c8a', (v) => marker.getWorldPosition(v), 'faint')

    entries.set(des, { line, marker, label, elements, caJd, selected: false })
  }

  function select(des) {
    for (const [key, e] of entries) {
      e.selected = key === des
      e.line.material.opacity = e.selected ? 1 : 0.4
      e.line.material.color.setHex(e.selected ? 0x57ffc9 : 0xff5c8a)
      e.marker.material.color.setHex(e.selected ? 0x57ffc9 : 0xff5c8a)
      e.label.setClass(e.selected ? 'big' : 'faint')
    }
  }

  function update(simDate) {
    const jd = simDate.getTime() / 86400000 + 2440587.5
    for (const e of entries.values()) {
      const within = Math.abs(jd - e.caJd) <= SPAN_DAYS
      e.marker.visible = within || e.selected
      e.label.setVisible(e.marker.visible)
      if (e.marker.visible) {
        geoVectorKm(e.elements, jd, tmp)
        e.marker.position.copy(tmp)
      }
    }
  }

  function getSelectedWorldPos(out) {
    for (const e of entries.values()) {
      if (e.selected) return e.marker.getWorldPosition(out)
    }
    return null
  }

  return { group, add, select, update, has: (des) => entries.has(des), getSelectedWorldPos }
}
