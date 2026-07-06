import { formatMissionTime } from '../core/clock.js'

const RANGE_DAYS = 7

export function initTimeline(clock) {
  const btnPlay = document.getElementById('btn-play')
  const btnNow = document.getElementById('btn-now')
  const track = document.getElementById('timeline-track')
  const cursor = document.getElementById('timeline-cursor')
  const missionTime = document.getElementById('mission-time')

  btnPlay.addEventListener('click', () => {
    clock.setPlaying(!clock.playing)
    btnPlay.textContent = clock.playing ? '▶' : '❚❚'
    btnPlay.classList.toggle('active', !clock.playing)
  })

  btnNow.addEventListener('click', () => {
    clock.jumpToNow()
    syncRateButtons()
  })

  const rateBtns = [...document.querySelectorAll('#rate-btns button')]

  function syncRateButtons() {
    for (const b of rateBtns) b.classList.toggle('active', Number(b.dataset.rate) === clock.rate)
  }

  for (const b of rateBtns) {
    b.addEventListener('click', () => {
      clock.rate = Number(b.dataset.rate)
      syncRateButtons()
    })
  }

  function scrub(e) {
    const rect = track.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    clock.setOffsetDays((f - 0.5) * 2 * RANGE_DAYS)
  }

  let dragging = false
  track.addEventListener('pointerdown', (e) => {
    dragging = true
    track.setPointerCapture(e.pointerId)
    scrub(e)
  })
  track.addEventListener('pointermove', (e) => dragging && scrub(e))
  track.addEventListener('pointerup', () => (dragging = false))

  function update() {
    const f = Math.min(1, Math.max(0, clock.offsetDays() / (2 * RANGE_DAYS) + 0.5))
    cursor.style.left = `${f * 100}%`
    missionTime.textContent = formatMissionTime(clock.now())
  }

  return { update }
}
