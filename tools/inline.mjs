// Fold the built bundle into one self-contained HTML file that opens with a
// double-click -- no dev server, no npm install, no network except OpenF1.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const js = readFileSync(resolve(root, 'dist/assets/app.js'), 'utf8')
// Read the stylesheet from source: Vite does not always re-emit the CSS
// asset for an IIFE build, and the sheet is plain CSS with no asset URLs.
const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>F1 Telemetry Console</title>
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>
<script>
${js}
</script>
</body>
</html>
`
writeFileSync(resolve(root, 'F1-Console.html'), html)
console.log(`F1-Console.html  ${(html.length / 1024).toFixed(0)} kB`)
