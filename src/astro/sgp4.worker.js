import * as satellite from 'satellite.js'

let satrecs = []
let meta = []

self.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'load') {
    satrecs = []
    meta = []
    const lines = msg.tleText.split('\n')
    for (let i = 0; i < lines.length; ) {
      const name = (lines[i] || '').trim()
      const l1 = lines[i + 1]
      const l2 = lines[i + 2]
      if (l1 && l2 && l1.startsWith('1 ') && l2.startsWith('2 ')) {
        const rec = satellite.twoline2satrec(l1, l2)
        if (rec.error === 0) {
          satrecs.push(rec)
          meta.push({
            name,
            noradId: rec.satnum,
            meanMotion: (rec.no ?? rec.no_kozai) * 1440 / (2 * Math.PI),
            inclinationDeg: rec.inclo * 180 / Math.PI,
            eccentricity: rec.ecco
          })
        }
        i += 3
      } else {
        i += 1
      }
    }
    self.postMessage({ type: 'loaded', count: satrecs.length, meta })
  } else if (msg.type === 'propagate') {
    const t = new Date(msg.timeMs)
    const n = satrecs.length
    const pos = new Float32Array(n * 3)
    const vel = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const pv = satellite.propagate(satrecs[i], t)
      const j = i * 3
      if (pv && pv.position) {
        pos[j] = pv.position.x
        pos[j + 1] = pv.position.y
        pos[j + 2] = pv.position.z
        vel[j] = pv.velocity.x
        vel[j + 1] = pv.velocity.y
        vel[j + 2] = pv.velocity.z
      } else {
        pos[j] = pos[j + 1] = pos[j + 2] = NaN
      }
    }
    self.postMessage({ type: 'state', timeMs: msg.timeMs, pos, vel }, [pos.buffer, vel.buffer])
  } else if (msg.type === 'orbit') {
    const rec = satrecs[msg.index]
    if (!rec) return
    const periodMin = (2 * Math.PI) / rec.no
    const steps = 160
    const pts = new Float32Array((steps + 1) * 3)
    for (let s = 0; s <= steps; s++) {
      const t = new Date(msg.timeMs + (s / steps) * periodMin * 60000)
      const pv = satellite.propagate(rec, t)
      const j = s * 3
      if (pv && pv.position) {
        pts[j] = pv.position.x
        pts[j + 1] = pv.position.y
        pts[j + 2] = pv.position.z
      }
    }
    self.postMessage({ type: 'orbit', index: msg.index, pts }, [pts.buffer])
  } else if (msg.type === 'track') {
    const rec = satrecs[msg.index]
    if (!rec) return
    const steps = msg.steps || 160
    const spanMin = msg.spanMin || 95
    const track = new Float32Array(steps * 2)
    for (let s = 0; s < steps; s++) {
      const t = new Date(msg.timeMs + ((s / (steps - 1)) - 0.15) * spanMin * 60000)
      const pv = satellite.propagate(rec, t)
      if (pv && pv.position) {
        const gd = satellite.eciToGeodetic(pv.position, satellite.gstime(t))
        track[s * 2] = gd.latitude
        track[s * 2 + 1] = gd.longitude
      } else {
        track[s * 2] = NaN
      }
    }
    self.postMessage({ type: 'track', index: msg.index, timeMs: msg.timeMs, track }, [track.buffer])
  }
}
