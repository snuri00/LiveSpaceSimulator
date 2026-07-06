import puppeteer from 'puppeteer-core'

const [url, out, waitMs = '20000'] = process.argv.slice(2)
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--window-size=1920,1080', '--hide-scrollbars']
})
const page = await browser.newPage()
await page.setViewport({ width: 1920, height: 1080 })
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) console.log('[console]', m.type(), m.text())
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('[goto]', e.message))
await new Promise((r) => setTimeout(r, parseInt(waitMs)))
await page.screenshot({ path: out })
await browser.close()
console.log('saved', out)
