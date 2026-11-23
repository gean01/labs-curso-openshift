'use strict';

const express = require('express');
const os = require('os');

const app = express();
const port = Number(process.env.PORT || 8080);

app.get('/health', (_req, res) => {
  res.status(200).type('text').send('ok');
});

app.get('/', (_req, res) => {
  const host = os.hostname();
  res
    .status(200)
    .type('html')
    .send(
      '<h1>lab2 node</h1>' +
        '<p>Aplicação do Lab 2 (S2I / Deployment / StatefulSet)</p>' +
        '<p>pod <code>' +
        host +
        '</code></p>'
    );
});

app.listen(port, '0.0.0.0', () => {
  console.log(`lab2-node listening on ${port} hostname=${os.hostname()}`);
});
