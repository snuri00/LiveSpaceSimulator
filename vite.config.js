import { defineConfig } from 'vite'

const jplProxy = {
  '/jpl-ssd': {
    target: 'https://ssd-api.jpl.nasa.gov',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/jpl-ssd/, '')
  },
  '/jpl-horizons': {
    target: 'https://ssd.jpl.nasa.gov',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/jpl-horizons/, '')
  },
  '/sdo': {
    target: 'https://sdo.gsfc.nasa.gov',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/sdo/, '')
  }
}

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  worker: { format: 'es' },
  server: { proxy: jplProxy },
  preview: { proxy: jplProxy }
})
