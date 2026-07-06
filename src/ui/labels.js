import * as THREE from 'three'

const v = new THREE.Vector3()

export function createLabelLayer() {
  const root = document.createElement('div')
  root.id = 'labels'
  document.body.appendChild(root)

  const groups = new Map()
  let activeGroup = null

  function group(name) {
    if (!groups.has(name)) groups.set(name, [])
    const items = groups.get(name)
    return {
      add(text, color, getPos, cls = '') {
        const el = document.createElement('div')
        el.className = `label ${cls}`
        el.textContent = text
        el.style.color = color
        el.style.display = 'none'
        root.appendChild(el)
        const item = { el, getPos, shown: true }
        items.push(item)
        return {
          setText: (t) => (el.textContent = t),
          setVisible: (s) => (item.shown = s),
          setClass: (c) => (el.className = `label ${c}`),
          remove: () => {
            el.remove()
            items.splice(items.indexOf(item), 1)
          }
        }
      },
      clear() {
        for (const it of items) it.el.remove()
        items.length = 0
      }
    }
  }

  function setActive(name) {
    activeGroup = name
    for (const [g, items] of groups) {
      if (g !== name) for (const it of items) it.el.style.display = 'none'
    }
  }

  function update(camera) {
    const items = groups.get(activeGroup) || []
    const w = window.innerWidth
    const h = window.innerHeight
    for (const it of items) {
      if (!it.shown) {
        it.el.style.display = 'none'
        continue
      }
      it.getPos(v)
      v.project(camera)
      if (v.z > 1 || v.z < -1) {
        it.el.style.display = 'none'
        continue
      }
      it.el.style.display = 'block'
      it.el.style.transform = `translate(${((v.x + 1) / 2) * w + 8}px, ${((1 - v.y) / 2) * h - 6}px)`
    }
  }

  return { group, setActive, update }
}
