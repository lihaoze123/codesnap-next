'use strict';

const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const root = path.resolve(__dirname, '..');
http
  .createServer(async (req, res) => {
    try {
      const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
      let content = await fs.readFile(file);
      const extension = path.extname(file);
      res.setHeader(
        'Content-Type',
        { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extension] ||
          'application/octet-stream'
      );
      if (extension === '.html') content = content.toString().replace(/%CSP_SOURCE%/gu, "'self'");
      res.end(content);
    } catch (error) {
      res.writeHead(404);
      res.end(error.message);
    }
  })
  .listen(4173, '127.0.0.1');
