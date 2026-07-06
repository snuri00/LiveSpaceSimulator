import { fetchCached } from './cache.js'

export const SDO_CHANNELS = [
  { id: '0193', label: 'AIA 193 · CORONA' },
  { id: '0304', label: 'AIA 304 · CHROMOSPHERE' },
  { id: 'HMIIC', label: 'HMI · VISIBLE' }
]

export function sdoImageUrl(channel) {
  return `/sdo/assets/img/latest/latest_1024_${channel}.jpg`
}

function apiKey() {
  return localStorage.getItem('nasa_api_key') || 'P6HqCaXUjhzBhcFCwEDlSL59B85DKsTOPkYgqiXq'
}

function ymd(offsetDays) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10)
}

function normalizeApod(d) {
  return {
    title: d.title,
    url: d.media_type === 'image' ? (d.hdurl || d.url) : d.thumbnail_url,
    date: d.date,
    explanation: d.explanation,
    mediaType: d.media_type
  }
}

export async function fetchApod() {
  const url = `https://api.nasa.gov/planetary/apod?api_key=${apiKey()}&thumbs=true`
  const { data } = await fetchCached('apod', url, 6 * 3600 * 1000, true)
  return normalizeApod(data)
}

export async function fetchApodRange(days = 10) {
  const url = `https://api.nasa.gov/planetary/apod?api_key=${apiKey()}&start_date=${ymd(-(days - 1))}&end_date=${ymd(0)}&thumbs=true`
  const { data } = await fetchCached(`apod-range-${ymd(0)}`, url, 6 * 3600 * 1000, true)
  return (Array.isArray(data) ? data : [data])
    .map(normalizeApod)
    .filter((a) => a.url)
    .reverse()
}
