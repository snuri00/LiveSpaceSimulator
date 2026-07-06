import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

const CRTShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      float shift = 0.0004;
      float r = texture2D(tDiffuse, uv + vec2(shift, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(shift, 0.0)).b;
      vec3 col = vec3(r, g, b);
      col += (rand(uv + fract(time)) - 0.5) * 0.045;
      col *= 0.975 + 0.025 * sin(time * 85.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `
}

export function createSceneManager(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })

  const QUALITY_LEVELS = [
    { pr: Math.min(window.devicePixelRatio, 1.75), bloom: true },
    { pr: Math.min(window.devicePixelRatio, 1.25), bloom: true },
    { pr: 1.0, bloom: true },
    { pr: 0.85, bloom: false },
    { pr: 0.7, bloom: false }
  ]
  let qualityLevel = 0
  let autoQuality = true

  renderer.setPixelRatio(QUALITY_LEVELS[0].pr)
  renderer.setSize(window.innerWidth, window.innerHeight)

  const composer = new EffectComposer(renderer)
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera())
  composer.addPass(renderPass)
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.5, 0.6, 0.12)
  composer.addPass(bloomPass)
  const crtPass = new ShaderPass(CRTShader)
  composer.addPass(crtPass)

  function applyQuality(level) {
    qualityLevel = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, level))
    const q = QUALITY_LEVELS[qualityLevel]
    renderer.setPixelRatio(q.pr)
    composer.setPixelRatio(q.pr)
    bloomPass.enabled = q.bloom
  }

  const views = []
  let active = null

  function createView({ far = 5e7, camPos = [0, 8000, 22000], minDistance = 10, maxDistance = 1e7 }) {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x02040a)
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, far)
    camera.position.set(...camPos)
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = minDistance
    controls.maxDistance = maxDistance
    controls.enabled = false
    const view = { scene, camera, controls, update: null, enter: null, exit: null, dynamicRotate: true }
    views.push(view)
    return view
  }

  function tuneRotateSpeed(view) {
    if (!view.dynamicRotate) return
    const dist = view.camera.position.distanceTo(view.controls.target)
    const ratio = dist / view.controls.minDistance
    const speed = Math.min(1, Math.max(0.28, 0.28 + (ratio - 1) * 0.5))
    view.controls.rotateSpeed = speed
    view.controls.zoomSpeed = Math.min(1, Math.max(0.45, 0.45 + (ratio - 1) * 0.4))
  }

  function setActive(view) {
    if (active === view) return
    if (active) {
      active.controls.enabled = false
      active.exit?.()
    }
    active = view
    renderPass.scene = view.scene
    renderPass.camera = view.camera
    view.controls.enabled = true
    view.enter?.()
  }

  window.addEventListener('resize', () => {
    for (const v of views) {
      v.camera.aspect = window.innerWidth / window.innerHeight
      v.camera.updateProjectionMatrix()
    }
    renderer.setSize(window.innerWidth, window.innerHeight)
    composer.setSize(window.innerWidth, window.innerHeight)
    applyQuality(qualityLevel)
  })

  let tween = null

  function flyTo(destPos, destTarget, duration = 1.1) {
    if (!active) return
    tween = {
      view: active,
      fromPos: active.camera.position.clone(),
      fromTarget: active.controls.target.clone(),
      toPos: destPos.clone(),
      toTarget: destTarget.clone(),
      t: 0,
      duration
    }
    active.controls.enabled = false
  }

  function cancelFly() {
    if (tween) {
      tween.view.controls.enabled = true
      tween = null
    }
  }

  function stepTween(dt) {
    if (!tween || tween.view !== active) return
    tween.t = Math.min(1, tween.t + dt / tween.duration)
    const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - Math.pow(-2 * tween.t + 2, 3) / 2
    active.camera.position.lerpVectors(tween.fromPos, tween.toPos, e)
    active.controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e)
    if (tween.t >= 1) {
      active.controls.enabled = true
      tween = null
    }
  }

  let lastRenderMs = 0
  let paused = false
  let emaFrameMs = 16
  let levelHoldMs = 0

  function setPaused(p) {
    paused = p
    if (p) lastRenderMs = 0
  }

  function monitorQuality(frameMs) {
    if (!autoQuality) return
    emaFrameMs = emaFrameMs * 0.9 + frameMs * 0.1
    levelHoldMs += frameMs
    if (levelHoldMs < 900) return
    if (emaFrameMs > 30 && qualityLevel < QUALITY_LEVELS.length - 1) {
      applyQuality(qualityLevel + 1)
      levelHoldMs = 0
    } else if (emaFrameMs < 19 && qualityLevel > 0) {
      applyQuality(qualityLevel - 1)
      levelHoldMs = 0
    }
  }

  function render(timeSec, simDate) {
    if (!active || paused) return
    crtPass.uniforms.time.value = timeSec
    const nowMs = timeSec * 1000
    const frameMs = lastRenderMs ? nowMs - lastRenderMs : 16
    const dt = lastRenderMs ? Math.min(0.05, frameMs / 1000) : 0.016
    lastRenderMs = nowMs
    stepTween(dt)
    if (!tween) tuneRotateSpeed(active)
    active.controls.update()
    active.update?.(simDate)
    composer.render()
    monitorQuality(frameMs)
  }

  function setAutoQuality(on) {
    autoQuality = on
    if (!on) applyQuality(0)
  }

  return {
    renderer, createView, setActive, render, flyTo, cancelFly, setPaused, setAutoQuality,
    isFlying: () => !!tween, getActive: () => active, getQualityLevel: () => qualityLevel
  }
}
