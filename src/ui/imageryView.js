import { SDO_CHANNELS, sdoImageUrl, fetchApodRange } from '../data/imagery.js'

export function createImageryView(feed) {
  const pan = document.getElementById('imagery-pan')
  const img = document.getElementById('big-img')
  const stage = document.getElementById('imagery-stage')
  const caption = document.getElementById('imagery-caption')
  const chanWrap = document.getElementById('sdo-channels')
  const apodNav = document.getElementById('apod-nav')
  const apodPrev = document.getElementById('apod-prev')
  const apodNext = document.getElementById('apod-next')
  const tabs = [...document.querySelectorAll('#imagery-tabs button')]

  let source = 'sdo'
  let sdoChannel = 0
  let apodList = []
  let apodIdx = 0
  let scale = 1
  let tx = 0
  let ty = 0

  function applyTransform() {
    pan.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
  }

  function reset() {
    scale = 1
    tx = 0
    ty = 0
    applyTransform()
  }

  for (const c of SDO_CHANNELS) {
    const b = document.createElement('button')
    b.textContent = c.label.split('·')[0].trim()
    if (c.id === SDO_CHANNELS[0].id) b.classList.add('active')
    b.addEventListener('click', () => {
      sdoChannel = SDO_CHANNELS.findIndex((x) => x.id === c.id)
      chanWrap.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b))
      loadSdo()
    })
    chanWrap.appendChild(b)
  }

  let retryTimer = null

  function loadImage(url, cap, retryFn) {
    clearTimeout(retryTimer)
    caption.textContent = `${cap} · LOADING…`
    img.onload = () => { caption.textContent = cap }
    img.onerror = () => {
      caption.textContent = `${cap} · LINK LOST · RETRYING`
      retryTimer = setTimeout(retryFn, 1500)
    }
    img.src = url
    reset()
  }

  function loadSdo() {
    const c = SDO_CHANNELS[sdoChannel]
    loadImage(`${sdoImageUrl(c.id)}?t=${Date.now()}`, `NASA SDO · ${c.label} · LIVE`, loadSdo)
  }

  function loadApod() {
    if (!apodList.length) {
      caption.textContent = 'APOD UNAVAILABLE'
      return
    }
    const a = apodList[apodIdx]
    apodNav.querySelector('#apod-count').textContent = `${apodIdx + 1} / ${apodList.length}`
    loadImage(a.url, `NASA APOD · ${a.title} · ${a.date}`, loadApod)
  }

  function stepApod(delta) {
    if (!apodList.length) return
    apodIdx = (apodIdx + delta + apodList.length) % apodList.length
    loadApod()
  }

  apodPrev.addEventListener('click', () => stepApod(-1))
  apodNext.addEventListener('click', () => stepApod(1))

  function setSource(s) {
    source = s
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.src === s))
    chanWrap.classList.toggle('hidden', s !== 'sdo')
    apodNav.classList.toggle('hidden', s !== 'apod')
    if (s === 'sdo') loadSdo()
    else loadApod()
  }

  for (const t of tabs) t.addEventListener('click', () => setSource(t.dataset.src))

  stage.addEventListener('wheel', (e) => {
    e.preventDefault()
    const rect = stage.getBoundingClientRect()
    const mx = e.clientX - rect.left - rect.width / 2
    const my = e.clientY - rect.top - rect.height / 2
    const prev = scale
    scale = Math.min(8, Math.max(1, scale * (e.deltaY < 0 ? 1.18 : 0.85)))
    const k = scale / prev
    tx = mx - (mx - tx) * k
    ty = my - (my - ty) * k
    if (scale === 1) { tx = 0; ty = 0 }
    applyTransform()
  }, { passive: false })

  let dragging = false
  let sx = 0
  let sy = 0
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#sdo-channels') || e.target.closest('#apod-nav')) return
    dragging = true
    sx = e.clientX - tx
    sy = e.clientY - ty
    stage.setPointerCapture(e.pointerId)
  })
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return
    tx = e.clientX - sx
    ty = e.clientY - sy
    applyTransform()
  })
  stage.addEventListener('pointerup', () => (dragging = false))
  stage.addEventListener('dblclick', reset)

  async function loadApodData() {
    try {
      apodList = await fetchApodRange(10)
      apodIdx = 0
      feed(`NASA APOD · ${apodList.length} RECENT ENTRIES`, 'ok')
    } catch {
      feed('APOD UNAVAILABLE', 'warn')
    }
  }

  function onShow() {
    if (source === 'sdo') loadSdo()
    else loadApod()
  }

  loadApodData()

  return { onShow, setSource }
}
