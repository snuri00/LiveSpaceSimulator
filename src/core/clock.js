export class SimClock {
  constructor() {
    this.offsetMs = 0
    this.rate = 1
    this.playing = true
    this.lastReal = performance.now()
    this.simMs = Date.now()
  }

  tick() {
    const now = performance.now()
    const dt = now - this.lastReal
    this.lastReal = now
    if (this.playing) this.simMs += dt * this.rate
    return this.now()
  }

  now() {
    return new Date(this.simMs)
  }

  setPlaying(p) {
    this.playing = p
  }

  jumpToNow() {
    this.simMs = Date.now()
    this.rate = 1
  }

  setOffsetDays(days) {
    this.simMs = Date.now() + days * 86400000
  }

  offsetDays() {
    return (this.simMs - Date.now()) / 86400000
  }
}

export function formatMissionTime(d) {
  const p = (n, w = 2) => String(n).padStart(w, '0')
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  return `${d.getUTCFullYear()}-${months[d.getUTCMonth()]}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`
}
