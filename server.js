import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import pkg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// ==================== CORS ====================
const origins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || origins.length === 0 || origins.includes(origin))
        return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  }),
);

// ==================== RATE LIMIT ====================
app.use(
  '/api/',
  rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
  }),
);

// ==================== DATABASE ====================
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const QuerySchema = z.object({
  text: z.string().min(1).max(2000),
  meta: z.record(z.any()).optional(),
});

// ==================== ROUTES ====================

// создать запись
app.post('/api/queries', async (req, res) => {
  const parsed = QuerySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  const { text, meta } = parsed.data;
  try {
    const ip = (req.ips && req.ips.length ? req.ips[0] : req.ip) || null;

    const result = await pool.query(
      `INSERT INTO query_logs(text, ip, meta)
       VALUES ($1, $2::inet, $3::jsonb)
       RETURNING id, created_at`,
      [text, ip, JSON.stringify(meta || {})],
    );

    res.status(201).json({
      ok: true,
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB insert failed' });
  }
});

// получить последние записи
app.get('/api/queries', async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
  try {
    const { rows } = await pool.query(
      `SELECT id, text, ip, created_at
       FROM query_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    res.json({ ok: true, items: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB select failed' });
  }
});

// healthcheck (для Render/мониторинга)
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// ==================== STATIC FILES ====================
app.use(express.static(__dirname));
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== SERVER START ====================
const defaultPort = process.env.PORT || 8080;

function startServer(port) {
  app
    .listen(port, () => {
      console.log(`✅ API + Static listening on :${port}`);
    })
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️  Порт ${port} уже занят, пробую следующий...`);
        startServer(Number(port) + 1);
      } else {
        console.error('❌ Server error:', err);
      }
    });
}

startServer(defaultPort);
