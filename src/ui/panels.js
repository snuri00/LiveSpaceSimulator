import { SAT_CATEGORIES } from '../data/celestrak.js'
import { blip } from './audio.js'

const feedEl = document.getElementById('feed-log')
const statsEl = document.getElementById('hud-stats')
const clockEl = document.getElementById('hud-clock')
const keyEl = document.getElementById('sat-key')
const viewInfoEl = document.getElementById('view-info')
const viewTabEl = document.getElementById('viewinfo-tab')
const nearestEl = document.getElementById('nearest-card')
const cadEl = document.getElementById('cad-table')
const detailPanel = document.getElementById('panel-detail')
const detailEl = document.getElementById('detail-card')
const craftStripEl = document.getElementById('craft-strip')

export function feed(text, cls = '') {
  const div = document.createElement('div')
  if (cls) div.className = cls
  div.textContent = text
  feedEl.appendChild(div)
  feedEl.scrollTop = feedEl.scrollHeight
  while (feedEl.children.length > 150) feedEl.removeChild(feedEl.firstChild)
  blip(cls || 'info')
}

const LEDS = ['UPLINK', 'SGP4', 'WX']
const ledsEl = document.getElementById('status-leds')
const ledMap = {}
for (const name of LEDS) {
  const span = document.createElement('span')
  span.className = 'led'
  span.innerHTML = `<i></i>${name}`
  ledsEl.appendChild(span)
  ledMap[name] = span
}

export function setLed(name, state) {
  const el = ledMap[name]
  if (!el) return
  el.classList.remove('ok', 'warn')
  if (state) el.classList.add(state)
}

const spacewxEl = document.getElementById('spacewx-card')

export function setSpaceWx(html) {
  spacewxEl.innerHTML = html
}

export function setHeaderStats(text) {
  statsEl.textContent = text
}

export function setHeaderClock(text) {
  clockEl.textContent = text
}

export function setViewInfo(html) {
  viewInfoEl.innerHTML = html
}

export function setViewTab(text) {
  viewTabEl.textContent = text
}

export function setNearest(html) {
  nearestEl.innerHTML = html
}

export function renderSatelliteKey(categoryCounts) {
  keyEl.innerHTML = ''
  const title = document.createElement('span')
  title.className = 'k-item'
  title.style.color = 'var(--cyan)'
  title.textContent = '► ACTIVE SATELLITE KEY'
  keyEl.appendChild(title)
  for (const c of SAT_CATEGORIES) {
    if (c.key === 'ISS') continue
    const n = categoryCounts[c.key] ?? 0
    if (!n) continue
    const item = document.createElement('span')
    item.className = 'k-item'
    const dot = document.createElement('span')
    dot.className = 'k-dot'
    const hex = '#' + c.color.toString(16).padStart(6, '0')
    dot.style.background = hex
    dot.style.boxShadow = `0 0 6px ${hex}`
    const label = document.createElement('span')
    label.textContent = c.label + ' '
    const countSpan = document.createElement('span')
    countSpan.className = 'k-count'
    countSpan.textContent = n.toLocaleString('en-US')
    item.append(dot, label, countSpan)
    keyEl.appendChild(item)
  }
}

export function setSatKeyVisible(show) {
  keyEl.classList.toggle('hidden', !show)
}

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

export function renderCadTable(rows, selectedDes, onSelect) {
  const table = document.createElement('table')
  table.innerHTML = '<thead><tr><th>DES</th><th>DATE</th><th>LD</th><th>KM/S</th></tr></thead>'
  const tbody = document.createElement('tbody')
  const now = Date.now()
  for (const r of rows) {
    const tr = document.createElement('tr')
    const d = new Date(r.timeMs)
    const dateStr = `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]}`
    tr.innerHTML = `<td>${r.des}</td><td>${dateStr}</td><td>${r.ld.toFixed(2)}</td><td>${r.vRel.toFixed(1)}</td>`
    if (r.timeMs < now) tr.classList.add('past')
    else if (r.timeMs - now < 5 * 86400000) tr.classList.add('imminent')
    if (r.des === selectedDes) tr.classList.add('selected')
    tr.addEventListener('click', () => onSelect(r.des))
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  cadEl.innerHTML = ''
  cadEl.appendChild(table)
}

export function markCadSelection(selectedDes, rows) {
  const trs = cadEl.querySelectorAll('tbody tr')
  trs.forEach((tr, i) => tr.classList.toggle('selected', rows[i]?.des === selectedDes))
}

export function showDetail(html) {
  detailEl.innerHTML = html
  detailPanel.classList.remove('hidden')
}

export function setDetailTab(text) {
  detailPanel.querySelector('.panel-tab').textContent = text
}

export function hideDetail() {
  detailPanel.classList.add('hidden')
}

export function onDetailClose(cb) {
  document.getElementById('detail-close').addEventListener('click', cb)
}

export function renderCraftStrip(craftList, activeKey, onSelect) {
  craftStripEl.innerHTML = ''
  for (const c of craftList) {
    const card = document.createElement('div')
    card.className = 'craft-card' + (c.key === activeKey ? ' active' : '')
    card.innerHTML = `<div class="cname">${c.label}</div><div class="cregion">${c.region}</div>`
    card.addEventListener('click', () => onSelect(c.key))
    craftStripEl.appendChild(card)
  }
}

export function setCraftStripVisible(show) {
  craftStripEl.classList.toggle('hidden', !show)
}
