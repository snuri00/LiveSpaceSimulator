import * as THREE from 'three'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { EARTH_RADIUS_KM, gmstRad } from '../astro/frames.js'
import { earthPosition } from '../astro/planets.js'
import { eclipticToEquatorial, jdFromDate } from '../astro/kepler.js'

function latLonToXyz(latDeg, lonDeg, r, out, o) {
  const lat = latDeg * Math.PI / 180
  const lon = lonDeg * Math.PI / 180
  out[o] = r * Math.cos(lat) * Math.cos(lon)
  out[o + 1] = r * Math.sin(lat)
  out[o + 2] = -r * Math.cos(lat) * Math.sin(lon)
}

export async function createEarth() {
  const group = new THREE.Group()

  const wire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(EARTH_RADIUS_KM, 5),
    new THREE.MeshBasicMaterial({ color: 0x2a4f88, wireframe: true, transparent: true, opacity: 0.42 })
  )
  group.add(wire)

  const fill = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_KM * 0.995, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x02040a, transparent: true, opacity: 0.92 })
  )
  group.add(fill)

  const equator = new THREE.Mesh(
    new THREE.TorusGeometry(EARTH_RADIUS_KM * 1.001, 20, 6, 128),
    new THREE.MeshBasicMaterial({ color: 0x4fd8ff })
  )
  equator.rotation.x = Math.PI / 2
  group.add(equator)

  const nightMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vNormalW;
      void main() {
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sunDir;
      varying vec3 vNormalW;
      void main() {
        float d = dot(normalize(vNormalW), normalize(sunDir));
        float night = smoothstep(0.12, -0.22, d);
        gl_FragColor = vec4(0.0, 0.008, 0.02, night * 0.72);
      }
    `
  })
  const nightShade = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS_KM * 1.008, 48, 48), nightMat)
  nightShade.renderOrder = 5
  group.add(nightShade)

  const loader = new THREE.TextureLoader()
  const base = import.meta.env.BASE_URL
  const [dayTex, nightTex] = await Promise.all([
    loader.loadAsync(`${base}textures/earth_day.jpg`),
    loader.loadAsync(`${base}textures/earth_night.png`)
  ])
  dayTex.colorSpace = THREE.SRGBColorSpace
  nightTex.colorSpace = THREE.SRGBColorSpace

  const texturedMat = new THREE.ShaderMaterial({
    uniforms: {
      dayTex: { value: dayTex },
      nightTex: { value: nightTex },
      sunDir: { value: new THREE.Vector3(1, 0, 0) }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D dayTex;
      uniform sampler2D nightTex;
      uniform vec3 sunDir;
      varying vec2 vUv;
      varying vec3 vNormalW;
      void main() {
        float d = dot(normalize(vNormalW), normalize(sunDir));
        float dayAmt = smoothstep(-0.15, 0.35, d);
        vec3 day = texture2D(dayTex, vUv).rgb;
        vec3 night = texture2D(nightTex, vUv).rgb;
        vec3 lit = day * 1.05;
        vec3 dark = night * 0.95 + day * 0.02;
        vec3 col = mix(dark, lit, dayAmt);
        col += vec3(0.015, 0.03, 0.06) * (1.0 - dayAmt);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  })
  const globe = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS_KM, 96, 64), texturedMat)
  globe.rotation.y = -Math.PI / 2
  globe.visible = false
  group.add(globe)

  const auroraMat = new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
      kp: { value: 2.0 },
      time: { value: 0 }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vLocal;
      varying vec3 vNormalW;
      void main() {
        vLocal = normalize(position);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sunDir;
      uniform float kp;
      uniform float time;
      varying vec3 vLocal;
      varying vec3 vNormalW;
      void main() {
        float lat = degrees(asin(clamp(vLocal.y, -1.0, 1.0)));
        float target = 67.0 - kp * 2.6;
        float band = exp(-pow((abs(lat) - target) / (2.6 + kp * 0.4), 2.0));
        float night = smoothstep(0.15, -0.25, dot(normalize(vNormalW), normalize(sunDir)));
        float flicker = 0.75 + 0.25 * sin(vLocal.x * 40.0 + time * 2.0) * sin(vLocal.z * 30.0 - time * 1.3);
        float intensity = band * night * flicker * smoothstep(0.5, 3.0, kp);
        vec3 col = mix(vec3(0.2, 1.0, 0.55), vec3(0.6, 0.35, 1.0), smoothstep(4.0, 8.0, kp));
        gl_FragColor = vec4(col, intensity * 0.85);
      }
    `
  })
  const aurora = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS_KM * 1.03, 96, 64), auroraMat)
  aurora.renderOrder = 7
  aurora.visible = false
  group.add(aurora)

  const atmoMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.6);
        gl_FragColor = vec4(0.31, 0.72, 1.0, 1.0) * rim * 0.55;
      }
    `
  })
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS_KM * 1.045, 48, 48), atmoMat)
  atmosphere.renderOrder = 6
  group.add(atmosphere)

  const res = await fetch(`${base}data/coastline110.json`)
  const geo = await res.json()
  const segs = []
  for (const feature of geo.features) {
    const lineStrings = feature.geometry.type === 'MultiLineString'
      ? feature.geometry.coordinates
      : [feature.geometry.coordinates]
    for (const line of lineStrings) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = new Float32Array(6)
        latLonToXyz(line[i][1], line[i][0], EARTH_RADIUS_KM * 1.004, a, 0)
        latLonToXyz(line[i + 1][1], line[i + 1][0], EARTH_RADIUS_KM * 1.004, a, 3)
        segs.push(...a)
      }
    }
  }
  const coastGeom = new LineSegmentsGeometry()
  coastGeom.setPositions(segs)
  const coastMat = new LineMaterial({
    color: 0x8fd8ff,
    linewidth: 2,
    worldUnits: false,
    transparent: true,
    opacity: 0.95
  })
  coastMat.resolution.set(window.innerWidth, window.innerHeight)
  window.addEventListener('resize', () => coastMat.resolution.set(window.innerWidth, window.innerHeight))
  const coast = new LineSegments2(coastGeom, coastMat)
  coast.computeLineDistances()
  group.add(coast)

  let mode = 'wireframe'
  const wireParts = [wire, fill, equator, coast, nightShade]

  function setMode(next) {
    mode = next
    const textured = next === 'textured'
    for (const p of wireParts) p.visible = !textured
    globe.visible = textured
  }

  function setAuroraKp(kp) {
    auroraMat.uniforms.kp.value = kp
    aurora.visible = kp >= 1.5
  }

  const sunEcl = new THREE.Vector3()
  const sunLocal = new THREE.Vector3()

  function update(simDate, tSec = 0) {
    const gmst = gmstRad(simDate)
    group.rotation.y = gmst
    const [ex, ey, ez] = earthPosition(jdFromDate(simDate))
    const [qx, qy, qz] = eclipticToEquatorial(-ex, -ey, -ez)
    sunEcl.set(qx, qz, -qy).normalize()
    nightMat.uniforms.sunDir.value.copy(sunEcl)

    sunLocal.copy(sunEcl).applyAxisAngle(new THREE.Vector3(0, 1, 0), -gmst)
    texturedMat.uniforms.sunDir.value.copy(sunLocal)
    auroraMat.uniforms.sunDir.value.copy(sunLocal)
    auroraMat.uniforms.time.value = tSec
  }

  return { group, update, setMode, setAuroraKp, getMode: () => mode, getSunDir: () => sunEcl }
}
