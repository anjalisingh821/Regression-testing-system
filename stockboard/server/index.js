import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import sqlite3 from 'sqlite3'
import fs, { mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import chokidar from 'chokidar'
import dotenv from 'dotenv'
import { runAiRegression } from './ai/runAiRegression.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000
const DB_DIR = join(__dirname, 'data')
const DB_PATH = join(DB_DIR, 'stockpulse.db')
const SALT_ROUNDS = 10

dotenv.config()

mkdirSync(DB_DIR, { recursive: true })

const db = new sqlite3.Database(DB_PATH)

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row ?? null)
    })
  })
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      wallet_balance REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)
  // Lightweight migration for existing DBs created before wallet support.
  const walletCol = await get(`SELECT 1 as ok FROM pragma_table_info('users') WHERE name = 'wallet_balance';`)
  if (!walletCol) {
    await run('ALTER TABLE users ADD COLUMN wallet_balance REAL NOT NULL DEFAULT 0;')
  }

  await run(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('ADD', 'WITHDRAW')),
      amount REAL NOT NULL,
      balance_after REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `)
}

// Allow browser requests from the dev server. For this demo, reflect the Origin header.
app.use(
  cors({
    origin: true,
  }),
)
app.use(express.json())

// AI regression state.
let aiStatus = { state: 'IDLE', currentRunId: null }

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/ai/status', (_req, res) => {
  res.json(aiStatus)
})

app.post('/api/ai/run', async (req, res) => {
  try {
    if (aiStatus.state === 'RUNNING') {
      return res.status(409).json({ message: 'AI regression already running.', status: aiStatus })
    }

    const changedFiles = Array.isArray(req.body?.changedFiles) ? req.body.changedFiles : ['manual_trigger']
    aiStatus = { state: 'RUNNING', currentRunId: `manual_${Date.now()}` }

    // Fire and forget; respond immediately.
    void runAiRegression({ changedFiles, trigger: 'manual' }).then(
      () => {
        aiStatus = { state: 'IDLE', currentRunId: null }
      },
      () => {
        aiStatus = { state: 'IDLE', currentRunId: null }
      },
    )

    return res.json({ message: 'AI regression started.', status: aiStatus })
  } catch (err) {
    return res.status(500).json({ message: 'Failed to start AI regression.' })
  }
})

app.get('/api/ai/latest', (_req, res) => {
  try {
    const latestPath = join(__dirname, 'data', 'ai-latest.json')
    if (!fs.existsSync(latestPath)) return res.json({ latest: null })
    const raw = fs.readFileSync(latestPath, 'utf-8')
    res.json({ latest: JSON.parse(raw) })
  } catch {
    res.json({ latest: null })
  }
})

app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {}
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields.' })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const normalizedName = String(name).trim()
    const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS)

    await run('INSERT INTO users(name, email, password_hash) VALUES(?,?,?)', [
      normalizedName,
      normalizedEmail,
      passwordHash,
    ])

    return res.status(201).json({
      message: 'Signup successful.',
      user: { name: normalizedName, email: normalizedEmail },
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ message: 'An account with this email already exists.' })
    }
    return res.status(500).json({ message: 'Failed to create account.' })
  }
})

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {}
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const user = await get('SELECT id, name, email, password_hash FROM users WHERE email = ?', [normalizedEmail])

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' })
    }

    const ok = await bcrypt.compare(String(password), user.password_hash)
    if (!ok) {
      return res.status(401).json({ message: 'Invalid email or password.' })
    }

    return res.json({
      message: 'Login successful.',
      user: { name: user.name, email: user.email },
    })
  } catch {
    return res.status(500).json({ message: 'Failed to login.' })
  }
})

app.post('/api/wallet/balance', async (req, res) => {
  try {
    const { email } = req.body ?? {}
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' })
    }
    const normalizedEmail = String(email).trim().toLowerCase()
    const user = await get('SELECT id, wallet_balance FROM users WHERE email = ?', [normalizedEmail])
    if (!user) {
      return res.status(404).json({ message: 'User not found.' })
    }

    const tx = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, type, amount, balance_after, created_at
         FROM wallet_transactions
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT 10`,
        [user.id],
        (err, rows) => {
          if (err) reject(err)
          else resolve(rows ?? [])
        },
      )
    })

    return res.json({
      balance: Number(user.wallet_balance ?? 0),
      transactions: tx,
    })
  } catch {
    return res.status(500).json({ message: 'Failed to load wallet.' })
  }
})

app.post('/api/wallet/add', async (req, res) => {
  try {
    const { email, amount } = req.body ?? {}
    const numericAmount = Number(amount)
    if (!email || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'Valid email and amount are required.' })
    }
    const normalizedEmail = String(email).trim().toLowerCase()
    const user = await get('SELECT id, wallet_balance FROM users WHERE email = ?', [normalizedEmail])
    if (!user) {
      return res.status(404).json({ message: 'User not found.' })
    }

    const nextBalance = Number(user.wallet_balance ?? 0) + numericAmount
    await run('UPDATE users SET wallet_balance = ? WHERE id = ?', [nextBalance, user.id])
    await run(
      'INSERT INTO wallet_transactions(user_id, type, amount, balance_after) VALUES(?, ?, ?, ?)',
      [user.id, 'ADD', numericAmount, nextBalance],
    )

    return res.json({ message: 'Funds added successfully.', balance: nextBalance })
  } catch {
    return res.status(500).json({ message: 'Failed to add funds.' })
  }
})

app.post('/api/wallet/withdraw', async (req, res) => {
  try {
    const { email, amount } = req.body ?? {}
    const numericAmount = Number(amount)
    if (!email || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'Valid email and amount are required.' })
    }
    const normalizedEmail = String(email).trim().toLowerCase()
    const user = await get('SELECT id, wallet_balance FROM users WHERE email = ?', [normalizedEmail])
    if (!user) {
      return res.status(404).json({ message: 'User not found.' })
    }

    const currentBalance = Number(user.wallet_balance ?? 0)
    if (numericAmount >= currentBalance) {
      return res.status(400).json({ message: 'Withdrawal amount must be less than available balance.' })
    }

    const nextBalance = currentBalance - numericAmount
    await run('UPDATE users SET wallet_balance = ? WHERE id = ?', [nextBalance, user.id])
    await run(
      'INSERT INTO wallet_transactions(user_id, type, amount, balance_after) VALUES(?, ?, ?, ?)',
      [user.id, 'WITHDRAW', numericAmount, nextBalance],
    )

    return res.json({ message: 'Funds withdrawn successfully.', balance: nextBalance })
  } catch {
    return res.status(500).json({ message: 'Failed to withdraw funds.' })
  }
})

initDb()
  .then(() => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      // eslint-disable-next-line no-console
      console.log(`Auth API running on http://127.0.0.1:${PORT}`)
    })
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // eslint-disable-next-line no-console
        console.error(`Port ${PORT} is already in use. Stop the other process or set PORT=4001 npm run api`)
      } else {
        // eslint-disable-next-line no-console
        console.error('Server error:', err)
      }
      process.exit(1)
    })

    // Start AI watcher once the server is up.
    const pending = new Set()
    let timer = null
    const debounceMs = 3500

    const watcher = chokidar.watch(
      [join(__dirname, '..', 'src'), join(__dirname, '..', 'tests'), join(__dirname, '..', 'playwright.config.ts')],
      {
        ignoreInitial: true,
        ignored: [
          '**/node_modules/**',
          '**/dist/**',
          '**/test-results/**',
          '**/server/data/**',
          '**/tests/generated/**',
        ],
      },
    )

    watcher.on('all', (_event, filePath) => {
      if (!filePath) return
      pending.add(filePath)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const changedFiles = Array.from(pending).map((p) => {
          try {
            return relative(process.cwd(), p)
          } catch {
            return p
          }
        })
        pending.clear()

        if (aiStatus.state !== 'RUNNING') {
          aiStatus = { state: 'RUNNING', currentRunId: `watcher_${Date.now()}` }
          void runAiRegression({ changedFiles, trigger: 'watcher' }).then(
            () => {
              aiStatus = { state: 'IDLE', currentRunId: null }
            },
            () => {
              aiStatus = { state: 'IDLE', currentRunId: null }
            },
          )
        }
      }, debounceMs)
    })
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize SQLite DB:', err)
    process.exit(1)
  })

