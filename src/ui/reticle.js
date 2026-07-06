import * as THREE from 'three'

export function createReticle() {
  const el = document.getElementById('reticle')
  const labelEl = document.getElementById('reticle-label')
  const svg = document.getElementById('reticle-svg')
  const line = document.getElementById('reticle-line')
  const detail = document.getElementById('panel-detail')
  const v = new THREE.Vector3()

  let getPos = null
  let label = ''

  function set(getWorldPos, text) {
    getPos = getWorldPos
    label = text || ''
    labelEl.textContent = label
    el.classList.add('on', 'rotate')
    svg.classList.add('on')
  }

  function clear() {
    getPos = null
    el.classList.remove('on', 'rotate')
    svg.classList.remove('on')
  }

  function hide() {
    el.style.display = 'none'
    line.style.opacity = '0'
  }

  function update(camera, visible = true) {
    if (!getPos || !visible) {
      hide()
      return
    }
    const p = getPos(v)
    if (!p) {
      hide()
      return
    }
    v.project(camera)
    if (v.z > 1 || v.z < -1) {
      hide()
      return
    }
    el.style.display = 'block'
    const w = window.innerWidth
    const h = window.innerHeight
    const sx = (v.x + 1) / 2 * w
    const sy = (1 - v.y) / 2 * h
    el.style.transform = `translate(${sx}px, ${sy}px)`
    if (!detail.classList.contains('hidden')) {
      const r = detail.getBoundingClientRect()
      line.setAttribute('x1', sx)
      line.setAttribute('y1', sy)
      line.setAttribute('x2', r.left)
      line.setAttribute('y2', r.top + 14)
      line.style.opacity = '0.6'
    } else {
      line.style.opacity = '0'
    }
  }

  return { set, clear, update }
}
