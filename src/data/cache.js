const DB_NAME = 'livespace-cache'
const STORE = 'kv'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function cacheGet(key, maxAgeMs) {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => {
        const rec = req.result
        if (rec && Date.now() - rec.at < maxAgeMs) resolve(rec.value)
        else resolve(null)
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function cacheSet(key, value) {
  try {
    const db = await openDb()
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ at: Date.now(), value }, key)
      tx.oncomplete = resolve
      tx.onerror = resolve
    })
  } catch {}
}

export async function fetchCached(key, url, maxAgeMs, asJson) {
  const hit = await cacheGet(key, maxAgeMs)
  if (hit) return { data: hit, fromCache: true }
  const res = await fetch(url)
  if (!res.ok) {
    const stale = await cacheGet(key, Infinity)
    if (stale) return { data: stale, fromCache: true, stale: true }
    throw new Error(`${url} -> HTTP ${res.status}`)
  }
  const data = asJson ? await res.json() : await res.text()
  await cacheSet(key, data)
  return { data, fromCache: false }
}
