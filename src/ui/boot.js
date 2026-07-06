const LINES = [
  ['LIVESPACE OS · BUILD 1.0.26', 'cy'],
  ['CRT PHOSPHOR ARRAY ........ OK', ''],
  ['WEBGL2 RENDER PIPE ........ OK', ''],
  ['SGP4 PROPAGATION CORE ..... OK', ''],
  ['EPHEMERIS KERNELS ......... OK', ''],
  ['DEEP SPACE UPLINKS ........ INIT', 'dim'],
  ['', ''],
  ['► ALL SYSTEMS NOMINAL', 'cy']
]

export function runBootSequence() {
  const overlay = document.getElementById('boot-overlay')
  const pre = document.getElementById('boot-lines')
  let i = 0
  let done = false

  function finish() {
    if (done) return
    done = true
    overlay.classList.add('done')
    setTimeout(() => overlay.remove(), 450)
  }

  overlay.addEventListener('click', finish)

  function next() {
    if (done) return
    if (i >= LINES.length) {
      setTimeout(finish, 350)
      return
    }
    const [text, cls] = LINES[i++]
    const div = document.createElement('div')
    if (cls) div.className = cls
    div.textContent = text
    pre.appendChild(div)
    setTimeout(next, text ? 120 + Math.random() * 130 : 60)
  }

  next()
}
