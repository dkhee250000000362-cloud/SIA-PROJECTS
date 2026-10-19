import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMutation, emptyWorkspace, visibleWorkspace } from './workspace.js'
import { hashLegacyPassword, hashPassword, needsPasswordRehash, verifyPassword } from './passwords.js'

const admin = { id: 'admin-id', role: 'admin', tenantId: null }
const tenant = { id: 'tenant-user', role: 'tenant', tenantId: 't1' }

test('bcrypt hashes verify passwords and reject mismatches', async () => {
  const hash = await hashPassword('correct horse battery staple')
  assert.match(hash, /^\$2[aby]\$/)
  assert.equal(await verifyPassword('correct horse battery staple', hash), true)
  assert.equal(await verifyPassword('incorrect password', hash), false)
  assert.equal(needsPasswordRehash(hash), false)
})

test('legacy scrypt hashes remain verifiable for login migration', async () => {
  const hash = await hashLegacyPassword('existing account password')
  assert.equal(await verifyPassword('existing account password', hash), true)
  assert.equal(await verifyPassword('existing account password', hash.slice(0, -1)), true)
  assert.equal(await verifyPassword('wrong password', hash.slice(0, -1)), false)
  assert.equal(await verifyPassword('wrong password', hash), false)
  assert.equal(needsPasswordRehash(hash), true)
})

test('room and bill changes are validated and stored with numeric amounts', () => {
  let workspace = emptyWorkspace()
  workspace = applyMutation(workspace, admin, {
    type: 'room.create',
    payload: { number: '1', capacity: '2', rate: '2500' },
  }).workspace
  const room = workspace.rooms[0]
  assert.equal(room.capacity, 2)
  assert.equal(room.rate, 2500)

  workspace.tenants.push({ id: 't1', active: true, roomId: room.id, bed: 'A' })
  const result = applyMutation(workspace, admin, {
    type: 'billing.generate',
    payload: { roomId: room.id, month: '2026-10', power: '100.50', water: '150' },
  })
  assert.equal(result.result.created, 1)
  assert.equal(result.workspace.bills[0].power, 100.5)
  assert.equal(result.workspace.bills[0].water, 150)
})

test('a boarder can create a repair ticket only for their own account', () => {
  const workspace = emptyWorkspace()
  workspace.tenants.push({ id: 't1', active: true })
  const result = applyMutation(workspace, tenant, {
    type: 'ticket.create',
    payload: { category: 'Plumbing', description: 'Leaking faucet', photo: null },
  })
  assert.equal(result.workspace.tickets[0].tenantId, 't1')
  assert.throws(
    () => applyMutation(workspace, admin, {
      type: 'ticket.create',
      payload: { category: 'Other', description: 'Not authorized', photo: null },
    }),
    { message: 'Only an active boarder can report a repair.' },
  )
})

test('boarders cannot change landlord workspace records or another tenant’s bill', () => {
  const workspace = emptyWorkspace()
  workspace.rooms.push({ id: 'r1', capacity: 1, cleaning: [] })
  workspace.tenants.push({ id: 't1', active: true }, { id: 't2', active: true })
  workspace.bills.push({ id: 'b2', tenantId: 't2', status: 'Pending' })

  assert.throws(
    () => applyMutation(workspace, tenant, { type: 'room.update', payload: { id: 'r1', change: { archived: true } } }),
    { message: 'You do not have permission to update this workspace.' },
  )
  assert.throws(
    () => applyMutation(workspace, tenant, {
      type: 'billing.attachProof',
      payload: { id: 'b2', proof: { name: 'receipt.jpg', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,aA==' } },
    }),
    { message: 'You cannot update this bill.' },
  )
})

test('tenant reads expose only their room and records', () => {
  const workspace = emptyWorkspace()
  workspace.rooms.push({ id: 'r1' }, { id: 'r2' })
  workspace.tenants.push({ id: 't1', roomId: 'r1' }, { id: 't2', roomId: 'r2' })
  workspace.bills.push({ id: 'b1', tenantId: 't1' }, { id: 'b2', tenantId: 't2' })
  workspace.tickets.push({ id: 'k1', tenantId: 't1' }, { id: 'k2', tenantId: 't2' })

  const visible = visibleWorkspace(workspace, tenant)
  assert.deepEqual(visible.rooms.map((room) => room.id), ['r1'])
  assert.deepEqual(visible.tenants.map((record) => record.id), ['t1'])
  assert.deepEqual(visible.bills.map((bill) => bill.id), ['b1'])
  assert.deepEqual(visible.tickets.map((ticket) => ticket.id), ['k1'])
})
