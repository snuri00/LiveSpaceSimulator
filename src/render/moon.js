import * as THREE from 'three'
import { moonGeoEclipticKm } from '../astro/planets.js'
import { eclipticToEquatorial, jdFromDate } from '../astro/kepler.js'

export function createMoon() {
  const group = new THREE.Group()

  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1737, 2),
    new THREE.MeshBasicMaterial({ color: 0x7a94c0, wireframe: true, transparent: true, opacity: 0.5 })
  )
  group.add(mesh)

  const orbitPts = []
  const nowJd = jdFromDate(new Date())
  for (let s = 0; s <= 180; s++) {
    const [ex, ey, ez] = moonGeoEclipticKm(nowJd + (s / 180) * 27.32)
    const [qx, qy, qz] = eclipticToEquatorial(ex, ey, ez)
    orbitPts.push(new THREE.Vector3(qx, qz, -qy))
  }
  const orbit = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(orbitPts),
    new THREE.LineBasicMaterial({ color: 0x4a6a96, transparent: true, opacity: 0.5 })
  )
  group.add(orbit)

  function update(simDate) {
    const [ex, ey, ez] = moonGeoEclipticKm(jdFromDate(simDate))
    const [qx, qy, qz] = eclipticToEquatorial(ex, ey, ez)
    mesh.position.set(qx, qz, -qy)
  }

  return { group, update, mesh }
}
