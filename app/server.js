'use strict';

const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const port = process.env.PORT || 8080;

function buildPool() {
  const user = process.env.POSTGRESQL_USER || process.env.PGUSER;
  const password = process.env.POSTGRESQL_PASSWORD || process.env.PGPASSWORD;
  const database = process.env.POSTGRESQL_DATABASE || process.env.PGDATABASE;
  const host = process.env.PGHOST || process.env.POSTGRESQL_HOST || 'lab-pg-svc-primary';
  const portDb = Number(process.env.PGPORT || process.env.POSTGRESQL_PORT || 5432);

  if (!user || !password || !database) {
    return null;
  }

  return new Pool({
    user,
    password,
    database,
    host,
    port: portDb,
    connectionTimeoutMillis: 5000,
  });
}

const pool = buildPool();

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      text VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/', async (_req, res) => {
  if (!pool) {
    return res.status(500).json({
      ok: false,
      message: 'Variáveis POSTGRESQL_USER / POSTGRESQL_PASSWORD / POSTGRESQL_DATABASE ausentes',
    });
  }

  try {
    const result = await pool.query('SELECT current_database() AS database, NOW() AS now');
    res.json({
      ok: true,
      message: 'Conectado ao PostgreSQL via Service do cluster',
      host: process.env.PGHOST || 'lab-pg-svc-primary',
      database: result.rows[0].database,
      now: result.rows[0].now,
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      message: 'Falha ao conectar no PostgreSQL',
      error: err.message,
    });
  }
});

app.get('/messages', async (_req, res) => {
  if (!pool) {
    return res.status(500).json({ ok: false, error: 'Pool não configurado' });
  }

  const client = await pool.connect();
  try {
    await ensureTable(client);
    const result = await client.query(
      'SELECT id, text, created_at FROM messages ORDER BY id ASC'
    );
    res.json({ ok: true, count: result.rowCount, messages: result.rows });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

app.post('/messages', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ ok: false, error: 'Pool não configurado' });
  }

  const text = (req.body && req.body.text) || req.query.text;
  if (!text || String(text).trim() === '') {
    return res.status(400).json({ ok: false, error: 'Informe text no JSON ou query string' });
  }

  const client = await pool.connect();
  try {
    await ensureTable(client);
    const result = await client.query(
      'INSERT INTO messages (text) VALUES ($1) RETURNING id, text, created_at',
      [String(text).slice(0, 200)]
    );
    res.status(201).json({ ok: true, message: result.rows[0] });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

app.listen(port, () => {
  console.log(`lab-app listening on ${port}`);
});
