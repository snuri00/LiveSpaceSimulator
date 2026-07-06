import { createSceneManager } from './core/scene.js'
import { SimClock, formatMissionTime } from './core/clock.js'
import { createEarth } from './render/earth.js'
import { createSatelliteLayer } from './render/satellites.js'
import { createStarfield } from './render/starfield.js'
import { createStarCatalog } from './render/stars.js'
import { sdoImageUrl } from './data/imagery.js'
import { createImageryView } from './ui/imageryView.js'
import { createMoon } from './render/moon.js'
import { createGeoTrajectories } from './render/geotraj.js'
import { createHelioContent } from './render/helio.js'
import { createCraftContent, CRAFT_LIST } from './render/craft.js'
import { fetchActiveSatellites } from './data/celestrak.js'
import { fetchCloseApproaches } from './data/cad.js'
import { fetchOrbitElements } from './data/sbdb.js'
import { fetchSentryStatus } from './data/sentry.js'
import { fetchRecentCmes } from './data/donki.js'
import { fetchCraftVectorAu } from './data/horizons.js'
import { jdFromDate } from './astro/kepler.js'
import * as THREE from 'three'
import { SAT_CATEGORIES } from './data/celestrak.js'
import {
  feed, setHeaderStats, setHeaderClock, setViewInfo, setViewTab, setNearest,
  renderSatelliteKey, setSatKeyVisible, renderCadTable, markCadSelection,
  showDetail, hideDetail, onDetailClose, renderCraftStrip, setCraftStripVisible,
  setDetailTab
} from './ui/panels.js'
import { initTimeline } from './ui/timeline.js'
import { createLabelLayer } from './ui/labels.js'
import { createReticle } from './ui/reticle.js'
import { runBootSequence } from './ui/boot.js'
import { toggleAudio } from './ui/audio.js'
import { setLed, setSpaceWx } from './ui/panels.js'
import { fetchFlares, fetchStorms, fetchKpNow } from './data/spacewx.js'
import { fetchNextLaunches } from './data/launches.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { circleTexture } from './render/pointTexture.js'

const canvas = document.getElementById('scene')
const sceneMgr = createSceneManager(canvas)
const clock = new SimClock()
const timeline = initTimeline(clock)
const labels = createLabelLayer()
const reticle = createReticle()
const imageryView = createImageryView(feed)

const geoView = sceneMgr.createView({ far: 5e7, camPos: [0, 9000, 26000], minDistance: 7200, maxDistance: 6e6 })
const helioView = sceneMgr.createView({ far: 5e6, camPos: [0, 2600, 4200], minDistance: 160, maxDistance: 60000 })
const craftView = sceneMgr.createView({ far: 1e5, camPos: [0, 12, 46], minDistance: 16, maxDistance: 300 })

const geoLabels = labels.group('geo')
const helioLabels = labels.group('helio')
labels.group('craft')

const state = {
  activeView: 'geo',
  cadRows: [],
  elements: new Map(),
  selectedDes: null,
  detail: null,
  satDetail: -1,
  issIndex: -1,
  wx: {},
  launches: [],
  satCount: 0,
  craftKey: 'vgr1',
  craftRanges: {},
  cmeCount: 0,
  followOn: false
}

const geoStarFallback = createStarfield(2500, 350000)
geoView.scene.add(geoStarFallback)
createStarCatalog(350000, 1).then((stars) => {
  geoView.scene.remove(geoStarFallback)
  geoView.scene.add(stars)
  feed(`STAR CATALOG · YALE BSC · ${8404} STARS`, 'ok')
}).catch(() => {})
const satLayer = createSatelliteLayer()
geoView.scene.add(satLayer.group)
const moon = createMoon()
geoView.scene.add(moon.group)
geoLabels.add('MOON', '#a8d8ff', (v) => moon.mesh.getWorldPosition(v), 'faint')
geoLabels.add('EARTH', '#4fd8ff', (v) => v.set(0, -7200, 0), 'faint')
const geoTraj = createGeoTrajectories(geoLabels)
geoView.scene.add(geoTraj.group)

let earthUpdate = null
let earthRef = null
let issModel = null
let issModelBase = 1
const issPosTmp = new THREE.Vector3()

const issDot = new THREE.Sprite(new THREE.SpriteMaterial({
  map: circleTexture(),
  color: 0x57ffc9,
  transparent: true,
  opacity: 0.95,
  depthWrite: false
}))
issDot.scale.setScalar(300)
issDot.visible = false
geoView.scene.add(issDot)

geoView.update = (simDate) => {
  earthUpdate?.(simDate, nowSec)
  satLayer.update(simDate, geoView.camera)
  moon.update(simDate)
  geoTraj.update(simDate)
  if (state.issIndex >= 0) {
    const pos = satLayer.getScenePosition(state.issIndex, issPosTmp)
    issDot.visible = !!pos
    if (pos) {
      issDot.position.copy(pos)
      const dist = geoView.camera.position.distanceTo(pos)
      issDot.scale.setScalar(Math.max(90, dist * 0.009))
      if (issModel) {
        const selected = state.satDetail === state.issIndex
        issModel.visible = selected && dist < 9500
        if (issModel.visible) {
          issModel.position.copy(pos)
          issModel.scale.setScalar(issModelBase * Math.min(420, Math.max(90, dist * 0.1)))
          issModel.rotation.y += 0.002
          issDot.visible = false
        }
      }
    }
  }
  rideFollow(geoView)
}

function latLonToSurface(latRad, lonRad, r) {
  return new THREE.Vector3(
    r * Math.cos(latRad) * Math.cos(lonRad),
    r * Math.sin(latRad),
    -r * Math.cos(latRad) * Math.sin(lonRad)
  )
}

let issTrackLine = null
satLayer.onTrack((msg) => {
  if (!earthRef || msg.index !== state.issIndex) return
  const pts = []
  for (let s = 0; s < msg.track.length / 2; s++) {
    const lat = msg.track[s * 2]
    if (Number.isNaN(lat)) continue
    pts.push(latLonToSurface(lat, msg.track[s * 2 + 1], 6371 * 1.012))
  }
  if (pts.length < 2) return
  const geom = new THREE.BufferGeometry().setFromPoints(pts)
  if (issTrackLine) {
    issTrackLine.geometry.dispose()
    issTrackLine.geometry = geom
  } else {
    issTrackLine = new THREE.Line(geom, new THREE.LineBasicMaterial({
      color: 0x57ffc9,
      transparent: true,
      opacity: 0.55
    }))
    earthRef.group.add(issTrackLine)
  }
})

const helio = createHelioContent(helioView.scene, helioLabels)
createStarCatalog(90000, 0.8).then((stars) => helio.replaceStars(stars)).catch(() => {})
helioView.update = (simDate) => {
  helio.update(simDate, helioView.camera, nowSec)
  rideFollow(helioView)
}

const craftContent = createCraftContent(craftView.scene)
let lastFrame = performance.now()
craftView.update = () => {
  const now = performance.now()
  craftContent.update(null, now - lastFrame)
}

satLayer.onLoaded(({ count, categoryCounts }) => {
  state.satCount = count
  feed(`${count.toLocaleString('en-US')} ACTIVE SATELLITES · TWO-BODY PROPAGATION`, 'ok')
  renderSatelliteKey(categoryCounts)
  updateHeaderStats()
  setLed('SGP4', 'ok')
  state.issIndex = satLayer.findIndex((m) => m.name.startsWith('ISS (ZARYA)'))
  if (state.issIndex >= 0) {
    geoLabels.add('◆ ISS', '#57ffc9', (v) => {
      if (!satLayer.getScenePosition(state.issIndex, v)) v.set(0, 1e9, 0)
    }, 'big')
    satLayer.requestTrack(state.issIndex, clock.now().getTime(), 95)
    feed('ISS LOCK · GROUND TRACK COMPUTED', 'ok')
  }
})

function updateHeaderStats() {
  const parts = []
  if (state.cadRows.length) parts.push(`TRACKED ${state.cadRows.length}`)
  if (state.elements.size) parts.push(`PLOTTED ${state.elements.size}`)
  if (state.satCount) parts.push(`ACTIVE SATS ${state.satCount.toLocaleString('en-US')}`)
  setHeaderStats(parts.join(' · '))
}

const VIEW_TABS = {
  geo: 'GEOCENTRIC EARTH MAP',
  helio: 'HELIOCENTRIC SOLAR MAP',
  craft: 'SPACECRAFT MODEL',
  imagery: 'LIVE NASA IMAGERY'
}

const imageryEl = document.getElementById('imagery-view')

function updateViewInfo() {
  if (state.activeView === 'geo') {
    setViewInfo(`
      <div class="row"><span class="k">FRAME</span><span class="v">ECI · TRUE-OF-DATE</span></div>
      <div class="row"><span class="k">PROPAGATOR</span><span class="v">SGP4 · WEB WORKER</span></div>
      <div class="row"><span class="k">SATELLITES</span><span class="v">${state.satCount.toLocaleString('en-US')}</span></div>
      <div class="row"><span class="k">NEO TRACKS</span><span class="v">${state.elements.size}</span></div>
      <hr /><div class="k">DRAG · ORBIT | SCROLL · ZOOM</div>
    `)
  } else if (state.activeView === 'helio') {
    setViewInfo(`
      <div class="row"><span class="k">FRAME</span><span class="v">ECLIPTIC J2000</span></div>
      <div class="row"><span class="k">PLANET EPHEM</span><span class="v">KEPLERIAN 1800-2050</span></div>
      <div class="row"><span class="k">NEO ORBITS</span><span class="v">${state.elements.size}</span></div>
      <div class="row"><span class="k">CME EVENTS</span><span class="v">${state.cmeCount}</span></div>
      <hr /><div class="k">DRAG · ORBIT | SCROLL · ZOOM</div>
    `)
  } else {
    const c = CRAFT_LIST.find((c) => c.key === state.craftKey)
    const range = state.craftRanges[c.key] ?? c.fallbackAu
    const live = state.craftRanges[c.key] != null
    const rangeStr = c.rangeText ?? `${range.toFixed(range < 2 ? 3 : 1)} AU ${live ? '· LIVE' : '· EST'}`
    setViewInfo(`
      <div class="name">${c.name}</div>
      <div class="row"><span class="k">STATUS</span><span class="v">${c.status}</span></div>
      <div class="row"><span class="k">REGION</span><span class="v">${c.region}</span></div>
      <div class="row"><span class="k">RANGE</span><span class="v">${rangeStr}</span></div>
      <div class="row"><span class="k">V-REL</span><span class="v">${c.vRel}</span></div>
      <div class="row"><span class="k">SIGNAL</span><span class="v">${c.signal}</span></div>
      <hr />
      <div class="row"><span class="k">LAUNCH</span><span class="v">${c.launch}</span></div>
      <div class="sub" style="color:var(--dim)">SRC NASA 3D RESOURCES · JPL HORIZONS</div>
    `)
  }
}

function switchView(name) {
  state.activeView = name
  document.querySelectorAll('#view-switch button[data-view]').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === name))
  const isImagery = name === 'imagery'
  imageryEl.classList.toggle('hidden', !isImagery)
  setViewTab(VIEW_TABS[name])
  if (isImagery) {
    imageryView.onShow()
    setSatKeyVisible(false)
    setCraftStripVisible(false)
    return
  }
  sceneMgr.setActive(name === 'geo' ? geoView : name === 'helio' ? helioView : craftView)
  labels.setActive(name)
  setSatKeyVisible(name === 'geo')
  setCraftStripVisible(name === 'craft')
  updateViewInfo()
}

document.querySelectorAll('#view-switch button[data-view]').forEach((b) =>
  b.addEventListener('click', () => switchView(b.dataset.view)))

const _flyDir = new THREE.Vector3()
const _flyDest = new THREE.Vector3()

function flyToWorld(view, objPos, framing) {
  _flyDir.subVectors(view.camera.position, view.controls.target)
  if (_flyDir.lengthSq() < 1) _flyDir.set(0, 0.4, 1)
  _flyDir.normalize()
  _flyDest.copy(objPos).addScaledVector(_flyDir, framing)
  sceneMgr.flyTo(_flyDest, objPos)
}

function selectionWorldPos(out) {
  if (state.satDetail >= 0 && state.activeView === 'geo') {
    return satLayer.getScenePosition(state.satDetail, out)
  }
  if (state.selectedDes) {
    if (state.activeView === 'geo') return geoTraj.getSelectedWorldPos(out)
    if (state.activeView === 'helio') return helio.getSelectedNeoWorldPos(out)
  }
  return null
}

const _followTmp = new THREE.Vector3()
const _followDelta = new THREE.Vector3()
let followPrev = null

function rideFollow(view) {
  if (!state.followOn || sceneMgr.isFlying()) {
    followPrev = null
    return
  }
  const p = selectionWorldPos(_followTmp)
  if (!p) {
    followPrev = null
    return
  }
  if (followPrev) {
    _followDelta.subVectors(p, followPrev)
    view.controls.target.add(_followDelta)
    view.camera.position.add(_followDelta)
    followPrev.copy(p)
  } else {
    followPrev = p.clone()
  }
}

function etaString(deltaMs) {
  if (deltaMs <= 0) return 'PASSED'
  const d = Math.floor(deltaMs / 86400000)
  const h = Math.floor((deltaMs % 86400000) / 3600000)
  const m = Math.floor((deltaMs % 3600000) / 60000)
  return `T- ${String(d).padStart(2, '0')}D ${String(h).padStart(2, '0')}H ${String(m).padStart(2, '0')}M`
}

function updateNearest(simMs) {
  const next = state.cadRows.find((r) => r.timeMs > simMs)
  if (!next) return
  setNearest(`
    <div class="head">► NEAREST APPROACH</div>
    <div class="obj">${next.des}</div>
    <div class="row"><span class="k">MISS</span><span class="v">${next.ld.toFixed(2)} LD</span></div>
    <div class="row"><span class="k"></span><span class="v">${Math.round(next.km).toLocaleString('en-US')} KM</span></div>
    <div class="row"><span class="k">V-REL</span><span class="v">${next.vRel.toFixed(2)} KM/S</span></div>
    <div class="row"><span class="k">ETA</span><span class="v hot">${etaString(next.timeMs - simMs)}</span></div>
    <div class="row"><span class="k">CA</span><span class="v">${next.cd}Z</span></div>
  `)
}

function renderDetailCard(simMs) {
  const d = state.detail
  if (!d) return
  const sb = d.sbdb
  const sentryHtml = d.sentry?.listed
    ? `<span class="v hot">IP ${d.sentry.impactProb.toExponential(1)}</span>`
    : '<span class="v good">NOT LISTED</span>'
  showDetail(`
    <div class="name">${sb?.fullname || d.row.des}</div>
    <div class="row"><span class="k">CLOSEST APPROACH</span><span class="v good">${etaString(d.row.timeMs - simMs)}</span></div>
    <div class="row"><span class="k"></span><span class="v">${d.row.cd}Z</span></div>
    <div class="row"><span class="k">MISS DISTANCE</span><span class="v">${d.row.ld.toFixed(2)} LD</span></div>
    <div class="row"><span class="k"></span><span class="v">${Math.round(d.row.km).toLocaleString('en-US')} KM</span></div>
    <div class="row"><span class="k">REL VELOCITY</span><span class="v">${d.row.vRel.toFixed(2)} KM/S</span></div>
    <div class="row"><span class="k">H MAG</span><span class="v">${Number.isFinite(d.row.h) ? d.row.h.toFixed(1) : '—'}</span></div>
    <hr />
    <div class="row"><span class="k">SENTRY WATCH</span>${sentryHtml}</div>
    ${sb ? `
    <div class="row"><span class="k">CLASS</span><span class="v">${sb.orbitClassCode}${sb.pha ? ' · PHA' : ''}</span></div>
    <div class="sub">${sb.orbitClass}</div>
    <div class="row"><span class="k">SUN ORBIT</span><span class="v">${(sb.per / 365.25).toFixed(2)} YR</span></div>
    <div class="row"><span class="k">MOID</span><span class="v">${sb.moid?.toFixed(4) ?? '—'} AU</span></div>
    ` : '<div class="sub">ORBIT RECORD UNAVAILABLE</div>'}
    <hr />
    <div class="sub">SOURCE: JPL CNEOS · SBDB · NASA SENTRY</div>
  `)
}

async function ensureElements(des, caJd) {
  if (state.elements.has(des)) return state.elements.get(des)
  const el = await fetchOrbitElements(des)
  state.elements.set(des, el)
  helio.addNeoOrbit(des, el)
  geoTraj.add(des, el, caJd)
  updateHeaderStats()
  updateViewInfo()
  return el
}

function clearSatSelection() {
  state.satDetail = -1
  satLayer.selectIndex(-1)
}

function renderSatDetail(simMs) {
  const i = state.satDetail
  if (i < 0) return
  const m = satLayer.getMeta()[i]
  const st = satLayer.getState(i, simMs)
  const cat = SAT_CATEGORIES.find((c) => c.key === m.category)
  const catHex = '#' + (cat?.color ?? 0x5a7391).toString(16).padStart(6, '0')
  showDetail(`
    <div class="name">${m.name}</div>
    <div class="row"><span class="k">NORAD ID</span><span class="v">${m.noradId}</span></div>
    <div class="row"><span class="k">CLASS</span><span class="v" style="color:${catHex}">${cat?.label ?? m.category}</span></div>
    <hr />
    <div class="row"><span class="k">ALTITUDE</span><span class="v">${st ? Math.round(st.altitudeKm).toLocaleString('en-US') + ' KM' : '—'}</span></div>
    <div class="row"><span class="k">VELOCITY</span><span class="v">${st ? st.speedKms.toFixed(2) + ' KM/S' : '—'}</span></div>
    <div class="row"><span class="k">PERIOD</span><span class="v">${(1440 / m.meanMotion).toFixed(1)} MIN</span></div>
    <div class="row"><span class="k">INCLINATION</span><span class="v">${m.inclinationDeg.toFixed(2)}°</span></div>
    <div class="row"><span class="k">ECCENTRICITY</span><span class="v">${m.eccentricity.toFixed(4)}</span></div>
    <div class="row"><span class="k">REVS / DAY</span><span class="v">${m.meanMotion.toFixed(2)}</span></div>
    <hr />
    <div class="sub">SOURCE: CELESTRAK GP · SGP4 LIVE STATE</div>
  `)
}

function selectSatellite(index) {
  const already = state.satDetail === index
  state.selectedDes = null
  state.detail = null
  markCadSelection(null, state.cadRows)
  geoTraj.select(null)
  helio.selectNeo(null)
  state.satDetail = index
  satLayer.selectIndex(index, clock.now().getTime())
  setDetailTab('SATELLITE')
  renderSatDetail(clock.now().getTime())
  const m = satLayer.getMeta()[index]
  reticle.set(selectionWorldPos, m.name)
  state.followOn = true
  followPrev = null
  const pos = satLayer.getScenePosition(index, new THREE.Vector3())
  if (pos) flyToWorld(geoView, pos, index === state.issIndex ? 3500 : 5200)
  if (!already) feed(`SAT LOCK · ${m.name} · NORAD ${m.noradId} · TRACKING`, 'info')
}

const raycaster = new THREE.Raycaster()
const pointerNdc = new THREE.Vector2()
let downX = 0
let downY = 0

canvas.addEventListener('pointerdown', (e) => {
  downX = e.clientX
  downY = e.clientY
  if (sceneMgr.isFlying()) sceneMgr.cancelFly()
  if (tour.active) tour.stop()
})

canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return
  if (state.activeView !== 'geo') return
  const points = satLayer.getPoints()
  if (!points) return
  pointerNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
  raycaster.params.Points.threshold = geoView.camera.position.length() * 0.012
  raycaster.setFromCamera(pointerNdc, geoView.camera)
  const targets = issDot.visible ? [issDot, points] : [points]
  const hits = raycaster.intersectObjects(targets, false)
  if (!hits.length) return
  const issHit = hits.find((h) => h.object === issDot)
  if (issHit) selectSatellite(state.issIndex)
  else selectSatellite(hits[0].index)
})

async function selectObject(des) {
  clearSatSelection()
  setDetailTab('ASTEROID')
  state.selectedDes = des
  markCadSelection(des, state.cadRows)
  const row = state.cadRows.find((r) => r.des === des)
  if (!row) return
  state.detail = { row, sbdb: null, sentry: null }
  renderDetailCard(clock.now().getTime())
  try {
    const [sb, sentry] = await Promise.all([
      ensureElements(des, row.jd).then(() => fetchOrbitElements(des)),
      fetchSentryStatus(des)
    ])
    state.detail.sbdb = sb
    state.detail.sentry = sentry
    feed(`SBDB OK · ${des} · ${sb.orbitClassCode || '?'} CLASS`, 'ok')
  } catch (err) {
    feed(`SBDB QUERY FAILED · ${des}`, 'warn')
  }
  geoTraj.select(des)
  helio.selectNeo(des)
  renderDetailCard(clock.now().getTime())
  reticle.set(selectionWorldPos, des)
  state.followOn = true
  followPrev = null
  const p = selectionWorldPos(new THREE.Vector3())
  if (p) {
    const framing = state.activeView === 'helio'
      ? Math.max(300, p.length() * 0.35)
      : Math.max(9000, p.length() * 0.32)
    flyToWorld(state.activeView === 'helio' ? helioView : geoView, p, framing)
  }
}

function recenterActiveView() {
  const av = sceneMgr.getActive()
  if (av) sceneMgr.flyTo(av.camera.position.clone(), new THREE.Vector3(0, 0, 0), 0.8)
}

onDetailClose(() => {
  state.selectedDes = null
  state.detail = null
  clearSatSelection()
  hideDetail()
  markCadSelection(null, state.cadRows)
  geoTraj.select(null)
  helio.selectNeo(null)
  reticle.clear()
  state.followOn = false
  followPrev = null
  recenterActiveView()
})

async function bootSatellites() {
  try {
    feed('CELESTRAK GP UPLINK · SATELLITE CATALOGUE')
    const { data, fromCache, stale, snapshot } = await fetchActiveSatellites()
    feed(snapshot ? 'CELESTRAK UNREACHABLE · BUNDLED SNAPSHOT IN USE'
      : fromCache ? (stale ? 'CELESTRAK OFFLINE · STALE CACHE IN USE' : 'CELESTRAK CACHE HIT')
      : 'CELESTRAK OK · FRESH DATA', stale || snapshot ? 'warn' : 'ok')
    satLayer.load(data)
  } catch (err) {
    feed(`CELESTRAK UPLINK FAILED · ${err.message}`, 'warn')
  }
}

async function bootEarth() {
  try {
    const earth = await createEarth()
    geoView.scene.add(earth.group)
    earthUpdate = earth.update
    earthRef = earth
    if (state.wx.kp) earth.setAuroraKp(state.wx.kp.kp)
    feed('EARTH MODEL ONLINE · TERMINATOR + ATMOSPHERE ACTIVE', 'ok')
  } catch (err) {
    feed(`EARTH MODEL FAILED · ${err.message}`, 'warn')
  }
  try {
    const loader = new GLTFLoader()
    const draco = new DRACOLoader()
    draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/gltf/`)
    loader.setDRACOLoader(draco)
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/iss.glb`)
    const root = gltf.scene
    root.traverse((node) => {
      if (node.isMesh) {
        node.material = new THREE.MeshBasicMaterial({
          color: 0x57ffc9,
          wireframe: true,
          transparent: true,
          opacity: 0.6
        })
      }
    })
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3()).length()
    const center = box.getCenter(new THREE.Vector3())
    root.position.sub(center)
    issModel = new THREE.Group()
    issModel.add(root)
    issModelBase = 1 / size
    issModel.scale.setScalar(issModelBase)
    issModel.visible = false
    geoView.scene.add(issModel)
    feed('ISS 3D MODEL STAGED · SELECT ISS TO RESOLVE', 'ok')
  } catch {
    feed('ISS 3D MODEL UNAVAILABLE', 'warn')
  }
}

const sdoTexLoader = new THREE.TextureLoader()

function bootImagery() {
  const url = `${sdoImageUrl('0193')}?t=${Math.floor(Date.now() / 300000)}`
  sdoTexLoader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace
    helio.setSunTexture(tex)
    feed('SDO UPLINK · SOLAR DISK MAPPED TO SUN', 'ok')
  }, undefined, () => feed('SDO IMAGERY UNAVAILABLE', 'warn'))
}

async function bootSpaceWeather() {
  const results = {}
  try {
    results.kp = await fetchKpNow()
    setLed('WX', 'ok')
  } catch {
    feed('SWPC KP UNAVAILABLE', 'warn')
  }
  try {
    results.flares = await fetchFlares()
    results.storm = await fetchStorms()
    if (results.storm?.gLevel) {
      setLed('WX', 'warn')
      feed(`GEOMAGNETIC STORM ACTIVE · ${results.storm.gLevel} · KP ${results.storm.maxKp}`, 'warn')
    } else {
      feed(`DONKI WX · ${results.flares.count} FLARES 7D${results.flares.maxClass ? ' · MAX ' + results.flares.maxClass : ''}`, 'ok')
    }
  } catch {
    feed('DONKI FLR/GST UNAVAILABLE', 'warn')
  }
  try {
    state.launches = await fetchNextLaunches()
    if (state.launches.length) feed(`LL2 · NEXT LAUNCH ${state.launches[0].name.split('|')[0].trim()}`, 'ok')
  } catch {
    feed('LAUNCH LIBRARY UNAVAILABLE', 'warn')
  }
  state.wx = results
  if (results.kp && earthRef) {
    earthRef.setAuroraKp(results.kp.kp)
    feed(`AURORAL OVAL · KP ${results.kp.kp.toFixed(1)} · OVATION MODEL`, 'ok')
  }
  renderSpaceWx(Date.now())
}

function kpColor(kp) {
  if (kp >= 5) return 'hot'
  if (kp >= 4) return ''
  return 'good'
}

function renderSpaceWx(nowMs) {
  const w = state.wx
  const kp = w.kp?.kp
  const launch = state.launches.find((l) => l.netMs > nowMs)
  const barW = kp != null ? Math.min(52, (kp / 9) * 52) : 0
  const barColor = kp >= 5 ? 'var(--rose)' : kp >= 4 ? 'var(--violet)' : 'var(--mint)'
  setSpaceWx(`
    <div class="row"><span class="k">KP INDEX</span><span class="v ${kp != null ? kpColor(kp) : ''}">${kp != null ? kp.toFixed(1) : '—'}<span class="kpbar"><i style="width:${barW}px;background:${barColor}"></i></span></span></div>
    <div class="row"><span class="k">FLARES 7D</span><span class="v">${w.flares ? `${w.flares.count}${w.flares.maxClass ? ' · MAX ' + w.flares.maxClass : ''}` : '—'}</span></div>
    <div class="row"><span class="k">GEOMAG</span><span class="v ${w.storm?.gLevel ? 'hot' : 'good'}">${w.storm?.gLevel ?? 'QUIET'}</span></div>
    ${launch ? `
    <div class="launch">► NEXT LAUNCH <span class="t">${etaString(launch.netMs - nowMs)}</span></div>
    <div class="launch" style="color:var(--ice)">${launch.name.split('|').map((s) => s.trim()).join(' · ')}</div>
    ` : ''}
  `)
}

async function bootAsteroids() {
  try {
    feed('CNEOS UPLINK INIT · CLOSE APPROACH DATA API')
    const { rows, fromCache } = await fetchCloseApproaches()
    state.cadRows = rows
    feed(`JPL CAD ${fromCache ? 'CACHE' : '200 OK'} · ${rows.length} REC`, 'ok')
    setLed('UPLINK', 'ok')
    feed(`CAD WINDOW ${rows[0]?.cd?.slice(0, 11) ?? ''} → ${rows[rows.length - 1]?.cd?.slice(0, 11) ?? ''}`)
    renderCadTable(rows, state.selectedDes, selectObject)
    updateNearest(Date.now())
    updateHeaderStats()
    const upcoming = rows.filter((r) => r.timeMs > Date.now() - 3 * 86400000).slice(0, 14)
    feed(`SBDB BATCH · ${upcoming.length} ORBIT QUERIES`)
    for (const r of upcoming) {
      try {
        await ensureElements(r.des, r.jd)
      } catch {
        feed(`SBDB MISS · ${r.des}`, 'warn')
      }
      await new Promise((res) => setTimeout(res, 120))
    }
    feed(`${state.elements.size} ORBITS RESOLVED · 3D PLOT READY`, 'ok')
    updateViewInfo()
  } catch (err) {
    feed(`CNEOS UPLINK FAILED · ${err.message}`, 'warn')
  }
}

async function bootCmes() {
  try {
    feed('DONKI UPLINK · SPACE WEATHER DATABASE')
    const events = await fetchRecentCmes()
    state.cmeCount = events.length
    helio.loadCmes(events)
    const earthDirected = events.filter((e) => e.earthDirected).length
    feed(`DONKI · ${events.length} CME · ${earthDirected} EARTH-DIRECTED`, 'ok')
    updateViewInfo()
  } catch (err) {
    feed('DONKI UNAVAILABLE · CME LAYER OFF', 'warn')
  }
}

async function bootCraft() {
  renderCraftStrip(CRAFT_LIST, state.craftKey, selectCraft)
  try {
    await craftContent.show(CRAFT_LIST[0])
    feed('SPACECRAFT MODELS · NASA 3D SOURCE · 5 VEHICLES', 'ok')
  } catch (err) {
    feed(`CRAFT MODEL LOAD FAILED · ${err.message}`, 'warn')
  }
  const jd = jdFromDate(new Date())
  for (const c of CRAFT_LIST) {
    if (!c.horizonsId) continue
    try {
      const vec = await fetchCraftVectorAu(c.horizonsId, jd)
      state.craftRanges[c.key] = vec.rangeAu
      helio.addCraftMarker(c.label, vec)
    } catch {
      feed(`HORIZONS MISS · ${c.label} · USING ESTIMATE`, 'warn')
    }
    await new Promise((res) => setTimeout(res, 150))
  }
  feed('STATE VECTORS · JPL HORIZONS', 'ok')
  if (state.activeView === 'craft') updateViewInfo()
}

async function selectCraft(key) {
  state.craftKey = key
  renderCraftStrip(CRAFT_LIST, key, selectCraft)
  updateViewInfo()
  const c = CRAFT_LIST.find((c) => c.key === key)
  try {
    await craftContent.show(c)
  } catch (err) {
    feed(`MODEL LOAD FAILED · ${c.label}`, 'warn')
  }
}

runBootSequence()

const audioBtn = document.getElementById('btn-audio')
audioBtn.addEventListener('click', () => {
  const on = toggleAudio()
  audioBtn.textContent = on ? '● AUDIO ON' : '◌ AUDIO OFF'
  audioBtn.classList.toggle('on', on)
})

const skinBtn = document.getElementById('btn-skin')
skinBtn.addEventListener('click', () => {
  if (!earthRef) return
  const next = earthRef.getMode() === 'wireframe' ? 'textured' : 'wireframe'
  earthRef.setMode(next)
  skinBtn.textContent = next === 'textured' ? '◲ TEXTURED' : '◱ WIRE'
  skinBtn.classList.toggle('on', next === 'textured')
  if (state.activeView !== 'geo') switchView('geo')
  feed(`EARTH RENDER · ${next.toUpperCase()}`, 'info')
})

const tourBtn = document.getElementById('btn-tour')

function helioOverview() {
  sceneMgr.flyTo(new THREE.Vector3(0, 2600, 4200), new THREE.Vector3(0, 0, 0))
}

const tourSteps = [
  () => { switchView('geo'); if (state.issIndex >= 0) selectSatellite(state.issIndex); return 7 },
  () => {
    const r = state.cadRows.find((r) => r.timeMs > Date.now() && state.elements.has(r.des))
    if (r) { switchView('geo'); selectObject(r.des) }
    return 7
  },
  () => { switchView('helio'); helioOverview(); return 6 },
  () => {
    const first = [...state.elements.keys()][0]
    if (first) { switchView('helio'); selectObject(first) }
    return 6
  },
  () => { switchView('craft'); selectCraft('vgr1'); return 6 },
  () => { switchView('craft'); selectCraft('bennu'); return 6 }
]

const tour = {
  active: false,
  index: 0,
  nextAt: 0,
  start() {
    this.active = true
    this.index = 0
    this.nextAt = 0
    tourBtn.classList.add('on')
    tourBtn.textContent = '❙❙ TOUR'
    feed('CINEMATIC TOUR · ENGAGED', 'ok')
  },
  stop() {
    if (!this.active) return
    this.active = false
    tourBtn.classList.remove('on')
    tourBtn.textContent = '▷ TOUR'
    feed('CINEMATIC TOUR · DISENGAGED', 'info')
  },
  tick(sec) {
    if (!this.active) return
    if (sec >= this.nextAt) {
      const dwell = tourSteps[this.index % tourSteps.length]()
      this.index++
      this.nextAt = sec + dwell
    }
  }
}

tourBtn.addEventListener('click', () => (tour.active ? tour.stop() : tour.start()))

const searchEl = document.getElementById('search')
searchEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return
  const q = searchEl.value.trim().toUpperCase()
  if (!q) return
  const satIdx = satLayer.findIndex((m) => m.name.toUpperCase().includes(q))
  if (satIdx >= 0) {
    if (state.activeView !== 'geo') switchView('geo')
    selectSatellite(satIdx)
    searchEl.blur()
    return
  }
  const row = state.cadRows.find((r) => r.des.toUpperCase().includes(q))
  if (row) {
    selectObject(row.des)
    searchEl.blur()
    return
  }
  feed(`SEARCH · NO MATCH FOR "${q}"`, 'warn')
})

feed('BOOT · LIVESPACE CONSOLE INIT', 'ok')
feed('RENDERER ONLINE · WEBGL2 · CRT POST-CHAIN')

const initialView = new URLSearchParams(location.search).get('view')
switchView(['geo', 'helio', 'craft', 'imagery'].includes(initialView) ? initialView : 'geo')
bootEarth()
bootSatellites()
bootAsteroids()
bootCmes()
bootCraft()
bootSpaceWeather()
bootImagery()

let lastSecond = 0
let lastTrackReqMs = 0
let nowSec = 0

function animate(tMs) {
  requestAnimationFrame(animate)
  nowSec = tMs / 1000
  const simDate = clock.tick()
  const simMs = simDate.getTime()
  timeline.update()
  setHeaderClock(formatMissionTime(simDate))
  sceneMgr.render(tMs / 1000, simDate)
  const activeView = sceneMgr.getActive()
  if (activeView) {
    labels.update(activeView.camera)
    const reticleVisible = state.activeView === 'geo' || state.activeView === 'helio'
    reticle.update(activeView.camera, reticleVisible)
  }
  tour.tick(nowSec)
  lastFrame = performance.now()
  const sec = Math.floor(simMs / 1000)
  if (sec !== lastSecond) {
    lastSecond = sec
    if (state.cadRows.length) updateNearest(simMs)
    if (state.detail) renderDetailCard(simMs)
    if (state.satDetail >= 0) renderSatDetail(simMs)
    if (state.wx.kp || state.launches.length) renderSpaceWx(Date.now())
    if (state.issIndex >= 0 && Math.abs(simMs - lastTrackReqMs) > 120000) {
      lastTrackReqMs = simMs
      satLayer.requestTrack(state.issIndex, simMs, 95)
    }
  }
}

requestAnimationFrame(animate)
