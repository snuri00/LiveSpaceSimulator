let ctx = null
let master = null
let on = false

function ensureContext() {
  if (ctx) return
  ctx = new (window.AudioContext || window.webkitAudioContext)()
  master = ctx.createGain()
  master.gain.value = 0.12
  master.connect(ctx.destination)

  const bufferSize = ctx.sampleRate * 2
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.5
  }
  const noise = ctx.createBufferSource()
  noise.buffer = buffer
  noise.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 220
  const noiseGain = ctx.createGain()
  noiseGain.gain.value = 0.5
  noise.connect(filter).connect(noiseGain).connect(master)
  noise.start()

  const hum = ctx.createOscillator()
  hum.type = 'sine'
  hum.frequency.value = 52
  const humGain = ctx.createGain()
  humGain.gain.value = 0.18
  hum.connect(humGain).connect(master)
  hum.start()

  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.07
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 90
  lfo.connect(lfoGain).connect(filter.frequency)
  lfo.start()
}

export function toggleAudio() {
  on = !on
  if (on) {
    ensureContext()
    ctx.resume()
    master.gain.setTargetAtTime(0.12, ctx.currentTime, 0.3)
  } else if (ctx) {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.15)
  }
  return on
}

export function isAudioOn() {
  return on
}

export function blip(kind = 'info') {
  if (!on || !ctx) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = kind === 'warn' ? 340 : kind === 'ok' ? 1180 : 880
  g.gain.setValueAtTime(0.05, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + 0.1)
}
