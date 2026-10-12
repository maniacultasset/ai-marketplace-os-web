// Applies the saved or system theme before first paint (no flash). Kept as a file, not inline,
// so the Content-Security-Policy can stay at script-src 'self'.
try {
  var t = localStorage.getItem('mkos.theme')
  var d = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', d)
  document.documentElement.style.colorScheme = d ? 'dark' : 'light'
} catch (e) {}
