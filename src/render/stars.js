import * as THREE from 'three'
import { circleTexture } from './pointTexture.js'

const DEG = Math.PI / 180

function bvToColor(bv, out) {
  const t = Math.max(-0.4, Math.min(2.0, bv))
  let r, g, b
  if (t < 0.0) { r = 0.61 + 0.5 * (t + 0.4) / 0.4; g = 0.7 + 0.28 * (t + 0.4) / 0.4; b = 1.0 }
  else if (t < 0.4) { r = 0.83 + 0.17 * t / 0.4; g = 0.86 + 0.12 * t / 0.4; b = 1.0 }
  else if (t < 0.8) { r = 1.0; g = 0.93 - 0.07 * (t - 0.4) / 0.4; b = 0.92 - 0.28 * (t - 0.4) / 0.4 }
  else { r = 1.0; g = 0.8 - 0.35 * Math.min(1, (t - 0.8) / 1.2); b = 0.64 - 0.44 * Math.min(1, (t - 0.8) / 1.2) }
  out.setRGB(r, g, b)
  return out
}

export async function createStarCatalog(radius, sizeScale = 1) {
  const res = await fetch(`${import.meta.env.BASE_URL}data/stars.json`)
  const stars = await res.json()
  const n = stars.length
  const positions = new Float32Array(n * 3)
  const colors = new Float32Array(n * 3)
  const sizes = new Float32Array(n)
  const col = new THREE.Color()

  for (let i = 0; i < n; i++) {
    const [ra, dec, mag, bv] = stars[i]
    const raR = ra * DEG
    const decR = dec * DEG
    const x = Math.cos(decR) * Math.cos(raR)
    const y = Math.cos(decR) * Math.sin(raR)
    const z = Math.sin(decR)
    positions[i * 3] = x * radius
    positions[i * 3 + 1] = z * radius
    positions[i * 3 + 2] = -y * radius
    bvToColor(bv, col)
    const bright = Math.min(1, Math.max(0.12, Math.pow(10, -0.16 * mag) * 2.2))
    colors[i * 3] = col.r * bright
    colors[i * 3 + 1] = col.g * bright
    colors[i * 3 + 2] = col.b * bright
    sizes[i] = Math.max(0.6, 3.4 - mag * 0.42) * sizeScale
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geom.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1))
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.1)

  const material = new THREE.ShaderMaterial({
    uniforms: { pointTex: { value: circleTexture() }, pixelScale: { value: radius / 900 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float starSize;
      uniform float pixelScale;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = starSize * pixelScale * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D pointTex;
      varying vec3 vColor;
      void main() {
        float a = texture2D(pointTex, gl_PointCoord).a;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    vertexColors: true
  })

  const points = new THREE.Points(geom, material)
  points.frustumCulled = false
  return points
}
