import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { createStarfield } from './starfield.js'

export const CRAFT_LIST = [
  { key: 'vgr1', label: 'VGR-1', name: 'VOYAGER 1', model: 'voyager.glb', horizonsId: '-31',
    launch: '1977-09-05', status: 'INTERSTELLAR · ACTIVE', region: 'INTERSTELLAR SPACE',
    signal: '70M DSN · X-BAND', fallbackAu: 169.5, vRel: '-17 KM/S' },
  { key: 'vgr2', label: 'VGR-2', name: 'VOYAGER 2', model: 'voyager.glb', horizonsId: '-32',
    launch: '1977-08-20', status: 'INTERSTELLAR · ACTIVE', region: 'INTERSTELLAR SPACE',
    signal: '70M DSN · X-BAND', fallbackAu: 141.9, vRel: '-15 KM/S' },
  { key: 'psp', label: 'PSP', name: 'PARKER SOLAR PROBE', model: 'psp.glb', horizonsId: '-96',
    launch: '2018-08-12', status: 'EXTENDED MISSION · ACTIVE', region: 'INNER HELIOSPHERE',
    signal: '34M DSN · KA-BAND', fallbackAu: 0.6, vRel: '~100 KM/S PERIHELION' },
  { key: 'juno', label: 'JUNO', name: 'JUNO', model: 'juno.glb', horizonsId: '-61',
    launch: '2011-08-05', status: 'EXTENDED MISSION', region: 'JOVIAN SYSTEM',
    signal: '70M DSN · X-BAND', fallbackAu: 5.1, vRel: 'JUPITER ORBIT' },
  { key: 'p10', label: 'PION-10', name: 'PIONEER 10', model: 'pioneer10.glb', horizonsId: '-23',
    launch: '1972-03-03', status: 'CONTACT LOST 2003', region: 'OUTER SOLAR SYSTEM',
    signal: 'NO CARRIER', fallbackAu: 139.4, vRel: '-12 KM/S' },
  { key: 'iss', label: 'ISS', name: 'INTERNATIONAL SPACE STATION', model: 'iss.glb', horizonsId: null,
    launch: '1998-11-20', status: 'CREWED · ACTIVE', region: 'LOW EARTH ORBIT',
    signal: 'TDRS · S/KU-BAND', rangeText: '~420 KM LEO', vRel: '7.66 KM/S' },
  { key: 'hst', label: 'HST', name: 'HUBBLE SPACE TELESCOPE', model: 'hubble.glb', horizonsId: null,
    launch: '1990-04-24', status: 'ACTIVE · SERVICED 5×', region: 'LOW EARTH ORBIT',
    signal: 'TDRS · S-BAND', rangeText: '~515 KM LEO', vRel: '7.59 KM/S' },
  { key: 'cassini', label: 'CASSINI', name: 'CASSINI-HUYGENS', model: 'cassini.glb', horizonsId: null,
    launch: '1997-10-15', status: 'GRAND FINALE 2017-09-15', region: 'SATURN · ARCHIVE',
    signal: 'MISSION ENDED', rangeText: '9.6 AU · FINAL', vRel: 'SATURN ENTRY' },
  { key: 'bennu', label: 'BENNU', name: '101955 BENNU · SHAPE MODEL', model: 'bennu.glb', horizonsId: null, holo: true,
    launch: 'DISCOVERED 1999', status: 'SAMPLE RETURNED 2023', region: 'APOLLO NEO · PHA',
    signal: 'OSIRIS-REx SURVEY', rangeText: 'a = 1.126 AU', vRel: 'Ø 490 M' }
]

export function createCraftContent(scene) {
  scene.add(createStarfield(1800, 4000, 5))

  const stage = new THREE.Group()
  scene.add(stage)

  const backdrop = new THREE.Mesh(
    new THREE.TorusGeometry(60, 0.06, 4, 220),
    new THREE.MeshBasicMaterial({ color: 0x35548a, transparent: true, opacity: 0.6 })
  )
  backdrop.rotation.x = Math.PI / 2.3
  scene.add(backdrop)

  const grid = new THREE.PolarGridHelper(70, 12, 8, 64, 0x1c3a66, 0x122442)
  grid.position.y = -14
  scene.add(grid)

  const loader = new GLTFLoader()
  const draco = new DRACOLoader()
  draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/gltf/`)
  loader.setDRACOLoader(draco)
  const cache = new Map()
  let current = null

  async function loadModel(file, holo) {
    if (cache.has(file)) return cache.get(file)
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${file}`)
    const root = gltf.scene
    let triangles = 0
    root.traverse((node) => {
      if (node.isMesh) {
        const g = node.geometry
        triangles += (g.index ? g.index.count : g.attributes.position.count) / 3
      }
    })
    const dense = holo || triangles > 120000
    const hologramMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float facing = abs(dot(normalize(vNormal), normalize(vView)));
          float rim = pow(1.0 - facing, 2.4);
          vec3 body = vec3(0.012, 0.05, 0.09) * (0.35 + 0.65 * facing);
          vec3 glow = vec3(0.43, 0.86, 1.0) * rim * 1.15;
          gl_FragColor = vec4(body + glow, 1.0);
        }
      `
    })
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x6fdcff,
      wireframe: true,
      transparent: true,
      opacity: Math.min(0.55, Math.max(0.18, 45000 / Math.max(1, triangles)))
    })
    root.traverse((node) => {
      if (node.isMesh) node.material = dense ? hologramMat : wireMat
    })
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3()).length()
    const center = box.getCenter(new THREE.Vector3())
    const wrapper = new THREE.Group()
    root.position.sub(center)
    wrapper.add(root)
    wrapper.scale.setScalar(24 / size)
    cache.set(file, wrapper)
    return wrapper
  }

  async function show(craft) {
    const model = await loadModel(craft.model, craft.holo)
    if (current) stage.remove(current)
    current = model
    stage.add(model)
  }

  function update(simDate, dtMs = 16) {
    stage.rotation.y += dtMs * 0.00012
  }

  return { show, update }
}
