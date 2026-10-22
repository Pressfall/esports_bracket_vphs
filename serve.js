/* Local web server for the site, at http://localhost:8080
   Start it with:  node serve.js        (or double-click start-localhost.cmd)
   Options:        --port 3000          use a different port
                   --open               open the site in your browser
   Only this computer can reach it. It uses Node's built-in modules, so there is nothing to install.

   Note: each address keeps its own saved scores (the browser stores them per address), so keep
   using the same port. To bring over scores from opening index.html directly, use
   Settings > Download backup there, then Settings > Restore from a backup here. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const args = process.argv.slice(2);
const portArg = args.indexOf('--port') >= 0 ? args[args.indexOf('--port') + 1] : process.env.PORT;
const PORT = Number(portArg) || 8080;
const HOST = '127.0.0.1';
const URL_TEXT = `http://localhost:${PORT}/`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf'
};

function reply(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, 'Method not allowed');

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return reply(res, 400, 'Bad request');
  }
  let file = path.join(ROOT, pathname);
  // Never serve anything outside the project folder, or hidden files like .git.
  if ((file !== ROOT && !file.startsWith(ROOT + path.sep)) || pathname.split('/').some(part => part.startsWith('.'))) {
    return reply(res, 403, 'Forbidden');
  }

  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (readErr, data) => {
      if (readErr) {
        if (pathname !== '/favicon.ico') console.log(`404  ${pathname}`);
        return reply(res, 404, 'Not found');
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        // Always check for a newer copy, so edits show up on refresh.
        'Cache-Control': 'no-cache'
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
});

function openBrowser() {
  const command = process.platform === 'win32' ? `start "" "${URL_TEXT}"`
    : process.platform === 'darwin' ? `open "${URL_TEXT}"` : `xdg-open "${URL_TEXT}"`;
  exec(command);
}

server.on('error', err => {
  if (err.code !== 'EADDRINUSE') throw err;
  // Most likely the site is already running in another window. Check, rather than switching
  // to another port (a different port would not have the saved scores).
  http.get(`http://${HOST}:${PORT}/js/brand.js`, res => {
    let body = '';
    res.on('data', chunk => { body += chunk; });
    res.on('end', () => {
      if (body.includes('const Brand')) {
        console.log(`The site is already running at ${URL_TEXT}`);
        if (args.includes('--open')) openBrowser();
      } else {
        console.log(`Port ${PORT} is being used by another program. Try:  node serve.js --port ${PORT + 1}`);
        console.log('(Each port keeps its own saved scores, so stick with one.)');
      }
    });
  }).on('error', () => console.log(`Port ${PORT} is busy. Try:  node serve.js --port ${PORT + 1}`));
});

server.listen(PORT, HOST, () => {
  console.log(`Smash Rankings is running at ${URL_TEXT}`);
  console.log('Keep this window open while you use the site. Press Ctrl+C to stop.');
  if (args.includes('--open')) openBrowser();
});
