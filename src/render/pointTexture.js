import * as THREE from 'three'

let circle = null
let ring = null

export function circleTexture() {
  if (circle) return circle
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.25)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  circle = new THREE.CanvasTexture(c)
  return circle
}

export function ringTexture() {
  if (ring) return ring
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  ctx.strokeStyle = 'rgba(255,255,255,1)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(32, 32, 24, 0, Math.PI * 2)
  ctx.stroke()
  ring = new THREE.CanvasTexture(c)
  return ring
}
