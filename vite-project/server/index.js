import 'dotenv/config'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import express from 'express'
import mysql from 'mysql2/promise'
import { applyMutation, emptyWorkspace, visibleWorkspace } from './workspace.js'
import { hashPassword, needsPasswordRehash, verifyPassword } from './passwords.js'

const app = express()
const port = Number(process.env.PORT || 3000)
const database = process.env.MYSQL_DATABASE || 'boarding_house'
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
})
const isProduction = process.env.NODE_ENV === 'production'
const SESSION_DAYS = 7

app.use(express.json({ limit: '15mb' }))

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function parseCookie(request, name) {
  const pair = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return pair ? pair.slice(name.length + 1) : ''
}

function setSessionCookie(response, token) {
  const secure = isProduction ? '; Secure' : ''
  response.setHeader(
    'Set-Cookie',
    `affinity_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`,
  )
}

function clearSessionCookie(response) {
  const secure = isProduction ? '; Secure' : ''
  response.setHeader('Set-Cookie', `affinity_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`)
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_state (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      workspace_data JSON NOT NULL,
      version BIGINT UNSIGNED NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id CHAR(36) NOT NULL PRIMARY KEY,
      role ENUM('admin', 'tenant') NOT NULL,
      tenant_id VARCHAR(64) NULL,
      name VARCHAR(160) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(160) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `)
  await pool.query('ALTER TABLE app_users MODIFY password_hash VARCHAR(255) NOT NULL')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      token_hash CHAR(64) NOT NULL PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_app_sessions_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
      INDEX idx_app_sessions_expires (expires_at)
    ) ENGINE=InnoDB
  `)
  await pool.execute(
    'INSERT IGNORE INTO workspace_state (id, workspace_data, version) VALUES (?, ?, ?)',
    [1, JSON.stringify(emptyWorkspace()), 0],
  )
}

async function readWorkspace(connection = pool, lock = false) {
  const [rows] = await connection.query(
    `SELECT workspace_data, version FROM workspace_state WHERE id = ?${lock ? ' FOR UPDATE' : ''}`,
    [1],
  )
  if (!rows.length) throw new Error('The workspace record is missing.')
  const workspace = typeof rows[0].workspace_data === 'string'
    ? JSON.parse(rows[0].workspace_data)
    : rows[0].workspace_data
  return { workspace, version: Number(rows[0].version) }
}

async function currentUser(request) {
  const token = parseCookie(request, 'affinity_session')
  if (!token) return null
  const [rows] = await pool.execute(
    `SELECT u.id, u.role, u.tenant_id AS tenantId, u.name, u.email
     FROM app_sessions s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()`,
    [tokenHash(token)],
  )
  return rows[0] || null
}

async function createSession(response, userId, connection = pool) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000)
  await connection.execute(
    'INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    [tokenHash(token), userId, expiresAt],
  )
  setSessionCookie(response, token)
}

async function requireUser(request, _response, next) {
  try {
    const user = await currentUser(request)
    if (!user) return next(httpError(401, 'Please sign in to continue.'))
    request.user = user
    return next()
  } catch (error) {
    return next(error)
  }
}

function validateAccount({ name, email, password }) {
  if (typeof name !== 'string' || !name.trim()) throw httpError(400, 'Enter your full name.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) throw httpError(400, 'Enter a valid email address.')
  if (typeof password !== 'string' || password.length < 8) throw httpError(400, 'Use a password with at least 8 characters.')
  if (Buffer.byteLength(password, 'utf8') > 72) throw httpError(400, 'Choose a password no longer than 72 UTF-8 bytes.')
}

async function loginResponse(response, userId) {
  await createSession(response, userId)
  const [rows] = await pool.execute(
    'SELECT id, role, tenant_id AS tenantId, name, email FROM app_users WHERE id = ?',
    [userId],
  )
  const { workspace, version } = await readWorkspace()
  return { session: rows[0], workspace: visibleWorkspace(workspace, rows[0]), version }
}

app.get('/api/session', asyncRoute(async (request, response) => {
  const user = await currentUser(request)
  const { workspace, version } = await readWorkspace()
  return response.json({ session: user, workspace: visibleWorkspace(workspace, user), version })
}))

app.post('/api/auth/admin/register', asyncRoute(async (request, response) => {
  const { name, propertyName, email, password } = request.body || {}
  validateAccount({ name, email, password })
  if (typeof propertyName !== 'string' || !propertyName.trim()) throw httpError(400, 'Enter your boarding house name.')
  const connection = await pool.getConnection()
  const userId = randomUUID()
  try {
    await connection.beginTransaction()
    const [admins] = await connection.execute('SELECT id FROM app_users WHERE role = ? LIMIT 1 FOR UPDATE', ['admin'])
    if (admins.length) throw httpError(409, 'A landlord account already exists.')
    const [existingEmails] = await connection.execute('SELECT id FROM app_users WHERE email = ? LIMIT 1', [normalizeEmail(email)])
    if (existingEmails.length) throw httpError(409, 'An account already uses that email.')
    const passwordHash = await hashPassword(password)
    const landlord = {
      name: name.trim(),
      propertyName: propertyName.trim(),
      email: normalizeEmail(email),
    }
    const { workspace, version } = await readWorkspace(connection, true)
    const nextWorkspace = { ...workspace, landlord }
    await connection.execute(
      'INSERT INTO app_users (id, role, tenant_id, name, email, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, 'admin', null, landlord.name, landlord.email, passwordHash],
    )
    await connection.execute('UPDATE workspace_state SET workspace_data = ?, version = version + 1 WHERE id = ? AND version = ?', [
      JSON.stringify(nextWorkspace), 1, version,
    ])
    await createSession(response, userId, connection)
    await connection.commit()
    return response.status(201).json({
      session: { id: userId, role: 'admin', tenantId: null, name: landlord.name, email: landlord.email },
      workspace: nextWorkspace,
      version: version + 1,
    })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}))

app.post('/api/auth/tenant/register', asyncRoute(async (request, response) => {
  const { name, email, phone = '', password } = request.body || {}
  validateAccount({ name, email, password })
  const normalizedEmail = normalizeEmail(email)
  const passwordHash = await hashPassword(password)
  const connection = await pool.getConnection()
  const userId = randomUUID()
  try {
    await connection.beginTransaction()
    const [existingUsers] = await connection.execute('SELECT id FROM app_users WHERE email = ? FOR UPDATE', [normalizedEmail])
    if (existingUsers.length) throw httpError(409, 'An account already uses that email. Sign in instead.')
    const { workspace, version } = await readWorkspace(connection, true)
    if (!workspace.landlord) throw httpError(409, 'A landlord must set up the boarding house before boarders can sign up.')
    const tenant = workspace.tenants.find((item) => item.active && item.email?.toLowerCase() === normalizedEmail)
    const tenantId = tenant?.id || `t${randomUUID()}`
    const nextWorkspace = structuredClone(workspace)
    if (!tenant) {
      nextWorkspace.tenants.push({
        id: tenantId, name: name.trim(), email: normalizedEmail, phone: String(phone).trim(),
        roomId: null, bed: null, active: true, docs: [], moveIn: new Date().toISOString().slice(0, 10), leaseEnd: '',
      })
    }
    await connection.execute(
      'INSERT INTO app_users (id, role, tenant_id, name, email, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, 'tenant', tenantId, tenant?.name || name.trim(), normalizedEmail, passwordHash],
    )
    await connection.execute('UPDATE workspace_state SET workspace_data = ?, version = version + ? WHERE id = ? AND version = ?', [
      JSON.stringify(nextWorkspace), tenant ? 0 : 1, 1, version,
    ])
    await createSession(response, userId, connection)
    await connection.commit()
    return response.status(201).json({
      session: { id: userId, role: 'tenant', tenantId, name: tenant?.name || name.trim(), email: normalizedEmail },
      workspace: visibleWorkspace(nextWorkspace, { role: 'tenant', tenantId }),
      version: version + (tenant ? 0 : 1),
    })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}))

app.post('/api/auth/login', asyncRoute(async (request, response) => {
  const { role, email, password } = request.body || {}
  if (!['admin', 'tenant'].includes(role)) throw httpError(400, 'Choose a valid account type.')
  const [rows] = await pool.execute(
    'SELECT id, password_hash FROM app_users WHERE role = ? AND email = ? LIMIT 1',
    [role, normalizeEmail(email)],
  )
  if (!rows.length || typeof password !== 'string' || !(await verifyPassword(password, rows[0].password_hash))) {
    throw httpError(401, 'That email and password combination was not found.')
  }
  if (needsPasswordRehash(rows[0].password_hash) && Buffer.byteLength(password, 'utf8') <= 72) {
    const passwordHash = await hashPassword(password)
    await pool.execute('UPDATE app_users SET password_hash = ? WHERE id = ? AND password_hash = ?', [
      passwordHash,
      rows[0].id,
      rows[0].password_hash,
    ])
  }
  return response.json(await loginResponse(response, rows[0].id))
}))

app.post('/api/auth/logout', requireUser, asyncRoute(async (request, response) => {
  const token = parseCookie(request, 'affinity_session')
  await pool.execute('DELETE FROM app_sessions WHERE token_hash = ?', [tokenHash(token)])
  clearSessionCookie(response)
  const { workspace, version } = await readWorkspace()
  return response.json({ success: true, workspace: visibleWorkspace(workspace, null), version })
}))

async function commitWorkspaceMutation(request, response, action) {
  const expectedVersion = Number(request.body?.version)
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw httpError(400, 'Workspace version is invalid.')
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const current = await readWorkspace(connection, true)
    if (current.version !== expectedVersion) {
      throw httpError(409, 'The workspace changed in another session. Your change was not saved; refresh and try again.')
    }
    const { workspace, result } = applyMutation(current.workspace, request.user, action)
    const [update] = await connection.execute(
      'UPDATE workspace_state SET workspace_data = ?, version = version + 1 WHERE id = ? AND version = ?',
      [JSON.stringify(workspace), 1, current.version],
    )
    if (!update.affectedRows) throw httpError(409, 'The workspace changed in another session. Refresh and try again.')
    await connection.commit()
    return response.json({
      workspace: visibleWorkspace(workspace, request.user),
      version: current.version + 1,
      result,
    })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

function registerMutation(method, path, type, payloadFromRequest = (request) => request.body?.payload) {
  app[method](path, requireUser, asyncRoute(async (request, response) => {
    const action = { type, payload: payloadFromRequest(request) }
    return commitWorkspaceMutation(request, response, action)
  }))
}

registerMutation('post', '/api/rooms', 'room.create')
registerMutation('put', '/api/rooms/:id', 'room.update', (request) => ({
  id: request.params.id,
  change: request.body?.payload?.change,
}))
registerMutation('put', '/api/rooms/:roomId/cleaning/:bed', 'room.clearCleaning', (request) => ({
  roomId: request.params.roomId,
  bed: request.params.bed,
}))
registerMutation('post', '/api/tenants', 'tenant.create')
registerMutation('post', '/api/tenants/import', 'tenant.import')
registerMutation('put', '/api/tenants/:id', 'tenant.update', (request) => ({
  id: request.params.id,
  change: request.body?.payload?.change,
}))
registerMutation('put', '/api/tenants/:tenantId/assignment', 'tenant.assign', (request) => ({
  tenantId: request.params.tenantId,
  roomId: request.body?.payload?.roomId,
  bed: request.body?.payload?.bed,
}))
registerMutation('put', '/api/tenants/:tenantId/move-out', 'tenant.moveOut', (request) => ({
  tenantId: request.params.tenantId,
}))
registerMutation('post', '/api/tenants/:tenantId/documents', 'tenant.addDoc', (request) => ({
  tenantId: request.params.tenantId,
  doc: request.body?.payload?.doc,
}))
registerMutation('delete', '/api/tenants/:tenantId/documents/:docId', 'tenant.removeDoc', (request) => ({
  tenantId: request.params.tenantId,
  docId: request.params.docId,
}))
registerMutation('post', '/api/bills/generate', 'billing.generate')
registerMutation('put', '/api/bills/:id/status', 'billing.setStatus', (request) => ({
  id: request.params.id,
  status: request.body?.payload?.status,
}))
registerMutation('put', '/api/bills/:id/proof', 'billing.attachProof', (request) => ({
  id: request.params.id,
  proof: request.body?.payload?.proof,
}))
registerMutation('post', '/api/tickets', 'ticket.create')
registerMutation('put', '/api/tickets/:id/status', 'ticket.setStatus', (request) => ({
  id: request.params.id,
  status: request.body?.payload?.status,
}))

try {
  await initializeDatabase()
} catch (error) {
  console.error(`Could not connect to MySQL database "${database}" or initialize its tables.`, error)
  process.exit(1)
}

const isViteDev = process.env.NODE_ENV !== 'production'
if (isViteDev) {
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
} else {
  const { default: path } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const root = path.dirname(fileURLToPath(import.meta.url))
  const dist = path.resolve(root, '..', 'dist')
  app.use(express.static(dist))
  app.use((request, response, next) => {
    if (request.method === 'GET' && request.accepts('html')) return response.sendFile(path.join(dist, 'index.html'))
    return next()
  })
}

app.use((error, _request, response, next) => {
  console.error('API request failed', error)
  if (response.headersSent) return next(error)
  response.status(error.status || 500).json({
    error: error.status ? error.message : 'The server could not complete your request. Check the API log for details.',
  })
})

app.listen(port, () => console.log(`Affinity API listening on http://localhost:${port}`))
