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

test('an unassigned boarder can submit a general report with a PNG and track its status', () => {
  const workspace = emptyWorkspace()
  workspace.tenants.push({ id: 't1', active: true, roomId: null })
  const result = applyMutation(workspace, tenant, {
    type: 'ticket.create',
    payload: {
      tenantId: 'another-tenant',
      category: 'Safety concern',
      description: 'The entrance light is not working.',
      propertyId: null,
      propertyLocation: 'Main entrance',
      specificLocation: 'Front steps',
      photo: { name: 'entrance.png', type: 'image/png', dataUrl: 'data:image/png;base64,aA==' },
    },
  })

  const ticket = result.workspace.tickets[0]
  assert.equal(ticket.tenantId, 't1')
  assert.equal(ticket.propertyId, null)
  assert.equal(ticket.roomId, null)
  assert.equal(ticket.propertyLocation, 'Main entrance')
  assert.equal(ticket.specificLocation, 'Front steps')
  assert.equal(ticket.photo.type, 'image/png')
  assert.equal(ticket.status, 'Pending')
  assert.equal(visibleWorkspace(result.workspace, tenant).tickets[0].id, ticket.id)
  assert.equal(visibleWorkspace(result.workspace, admin).tickets[0].tenantId, 't1')

  const updated = applyMutation(result.workspace, admin, {
    type: 'ticket.setStatus',
    payload: { id: ticket.id, status: 'In Progress' },
  })
  assert.equal(visibleWorkspace(updated.workspace, tenant).tickets[0].status, 'In Progress')
  const responded = applyMutation(updated.workspace, admin, {
    type: 'ticket.respond',
    payload: { id: ticket.id, response: 'A technician will inspect the entrance light.' },
  })
  assert.equal(visibleWorkspace(responded.workspace, tenant).tickets[0].response, 'A technician will inspect the entrance light.')
})

test('an assigned property can be included in a report without a room assignment', () => {
  const workspace = emptyWorkspace()
  workspace.tenants.push({ id: 't1', active: true, roomId: null, propertyId: 'p1' })
  workspace.properties.push({ id: 'p1', name: 'Garden House', published: false, roomIds: [] })
  const result = applyMutation(workspace, tenant, {
    type: 'ticket.create',
    payload: {
      category: 'Plumbing',
      description: 'A pipe is leaking near the entrance.',
      propertyId: 'p1',
    },
  })
  assert.equal(result.workspace.tickets[0].propertyId, 'p1')
  assert.equal(result.workspace.tickets[0].roomId, null)
  assert.equal(visibleWorkspace(result.workspace, tenant).properties[0].id, 'p1')

  const general = applyMutation(result.workspace, tenant, {
    type: 'ticket.create',
    payload: {
      category: 'Cleanliness',
      description: 'The shared waste area needs attention.',
      propertyId: null,
    },
  })
  assert.equal(general.workspace.tickets[0].propertyId, null)
  assert.equal(general.workspace.tickets[0].roomId, null)
})

test('a report from a tenant with a room keeps its assigned property and room', () => {
  const workspace = emptyWorkspace()
  workspace.rooms.push({ id: 'r1' })
  workspace.tenants.push({ id: 't1', active: true, roomId: 'r1', bed: 'A' })
  workspace.properties.push({ id: 'p1', name: 'Garden House', roomIds: ['r1'] })
  const result = applyMutation(workspace, tenant, {
    type: 'ticket.create',
    payload: {
      category: 'Electrical',
      description: 'The bedroom outlet is not working.',
    },
  })
  assert.equal(result.workspace.tickets[0].propertyId, 'p1')
  assert.equal(result.workspace.tickets[0].roomId, 'r1')
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

test('published property listings and booking inquiries are role-scoped', () => {
  let workspace = emptyWorkspace()
  workspace = applyMutation(workspace, admin, {
    type: 'room.create',
    payload: { number: '101', capacity: 2, rate: 4500 },
  }).workspace
  const room = workspace.rooms[0]
  const created = applyMutation(workspace, admin, {
    type: 'property.create',
    payload: {
      name: 'Garden House',
      address: '12 Main Street',
      city: 'Quezon City',
      monthlyRate: 4500,
      description: 'Quiet home near transit.',
      rules: '',
      amenities: ['Wi-Fi'],
      images: [],
      roomIds: [room.id],
    },
  })
  workspace = created.workspace
  const property = workspace.properties[0]
  workspace.tenants.push({ id: 't1', active: true, roomId: null })
  assert.deepEqual(visibleWorkspace(workspace, tenant).properties, [])

  workspace = applyMutation(workspace, admin, {
    type: 'property.update',
    payload: { id: property.id, change: { published: true } },
  }).workspace
  const visible = visibleWorkspace(workspace, tenant)
  assert.deepEqual(visible.properties.map((item) => item.id), [property.id])
  assert.equal(visible.properties[0].availableBeds, 2)
  assert.deepEqual(visible.rooms.map((item) => item.id), [room.id])
  assert.equal(visible.rooms[0].availableBeds, 2)
  assert.equal(visible.auditLog, undefined)

  workspace = applyMutation(workspace, tenant, {
    type: 'property.inquiry',
    payload: { propertyId: property.id, message: 'Is a room available next month?' },
  }).workspace
  assert.equal(workspace.bookingRequests[0].tenantId, tenant.tenantId)
  assert.throws(() => applyMutation(workspace, tenant, {
    type: 'property.inquiry',
    payload: { propertyId: property.id, message: 'Another inquiry' },
  }), { message: 'You already have an active inquiry for this listing.' })
  assert.equal(visibleWorkspace(workspace, tenant).bookingRequests.length, 1)
})

test('rental inquiry, tenant-signed contract, and approved extension are tenant scoped', () => {
  const workspace = emptyWorkspace()
  workspace.tenants.push({
    id: 't1', active: true, name: 'Jordan Jardio', email: 'jordan@example.com',
    phone: '09171234567', roomId: null,
  })
  workspace.rooms.push({ id: 'r1', number: '101', rate: 5000, capacity: 2, cleaning: [] })
  workspace.properties.push({
    id: 'p1', name: 'Garden House', address: '12 Main Street', city: 'Quezon City',
    monthlyRate: 4500, published: true, roomIds: ['r1'], rules: 'Quiet hours after 10 PM.',
  })
  workspace.landlord = { name: 'Avery Owner', email: 'owner@example.com', phone: '09998887777' }

  const inquiryResult = applyMutation(workspace, tenant, {
    type: 'property.inquiry',
    payload: {
      propertyId: 'p1', roomId: 'r1', moveInDate: '2099-01-31',
      durationMonths: 1, message: 'Please let me know about the room.',
    },
  })
  const inquiry = inquiryResult.workspace.bookingRequests[0]
  assert.equal(inquiry.tenantName, 'Jordan Jardio')
  assert.equal(inquiry.tenantPhone, '09171234567')
  assert.equal(inquiry.status, 'Pending')
  assert.equal(inquiry.roomId, 'r1')

  const acceptedInquiry = applyMutation(inquiryResult.workspace, admin, {
    type: 'booking.update',
    payload: { id: inquiry.id, status: 'Accepted', response: 'Your inquiry is accepted.' },
  })
  const created = applyMutation(acceptedInquiry.workspace, admin, {
    type: 'contract.create',
    payload: { inquiryId: inquiry.id },
  })
  let contract = created.workspace.contracts[0]
  assert.match(contract.contractNumber, /^AFF-\d{4}-[A-F0-9]{8}$/)
  assert.equal(contract.tenantEmail, 'jordan@example.com')
  assert.equal(contract.landlordEmail, 'owner@example.com')
  assert.equal(contract.propertyAddress, '12 Main Street, Quezon City')
  assert.equal(contract.roomNumber, '101')
  assert.equal(contract.monthlyRent, 5000)
  assert.equal(contract.endDate, '2099-02-27')
  assert.equal(contract.status, 'Draft')

  const updated = applyMutation(created.workspace, admin, {
    type: 'contract.update',
    payload: { id: contract.id, change: { securityDeposit: 5000, additionalNotes: 'Return keys at checkout.' } },
  })
  const sent = applyMutation(updated.workspace, admin, {
    type: 'contract.send',
    payload: { id: contract.id },
  })
  contract = sent.workspace.contracts[0]
  assert.equal(contract.status, 'Awaiting Tenant Acceptance')
  assert.equal(visibleWorkspace(sent.workspace, tenant).contracts[0].status, 'Awaiting Tenant Acceptance')
  assert.throws(() => applyMutation(sent.workspace, tenant, {
    type: 'contract.decide',
    payload: { id: contract.id, decision: 'Accepted', signature: 'Other Person' },
  }), { message: 'Your electronic signature must match your registered tenant name.' })
  const signed = applyMutation(sent.workspace, tenant, {
    type: 'contract.decide',
    payload: { id: contract.id, decision: 'Accepted', signature: 'Jordan Jardio' },
  })
  assert.equal(signed.workspace.contracts[0].status, 'Accepted')
  assert.ok(signed.workspace.contracts[0].acceptedAt)
  assert.equal(signed.workspace.contracts[0].signature, 'Jordan Jardio')

  assert.throws(() => applyMutation(signed.workspace, tenant, {
    type: 'contract.update',
    payload: { id: contract.id, change: { endDate: '2026-12-31' } },
  }), { message: 'You do not have permission to update this workspace.' })

  const extensionResult = applyMutation(signed.workspace, tenant, {
    type: 'extension.create',
    payload: { contractId: contract.id, additionalDays: 7, reason: 'My move is delayed.' },
  })
  const extension = extensionResult.workspace.extensionRequests[0]
  assert.equal(extension.originalEndDate, '2099-02-27')
  assert.equal(extension.requestedEndDate, '2099-03-06')
  assert.equal(extension.proposedAdditionalCost, 1166.67)
  assert.equal(visibleWorkspace(extensionResult.workspace, tenant).extensionRequests.length, 1)

  const approved = applyMutation(extensionResult.workspace, admin, {
    type: 'extension.review',
    payload: { id: extension.id, status: 'Approved', additionalCost: 1000, notes: 'Pay with December rent.' },
  })
  const extendedContract = approved.workspace.contracts[0]
  assert.equal(extendedContract.endDate, '2099-03-06')
  assert.equal(extendedContract.durationDays, 35)
  assert.equal(extendedContract.endDateHistory[0].previousEndDate, '2099-02-27')
  assert.equal(extendedContract.endDateHistory[0].newEndDate, '2099-03-06')
  assert.equal(extendedContract.endDateHistory[0].additionalCost, 1000)
  assert.equal(approved.workspace.extensionRequests[0].status, 'Approved')
  assert.equal(visibleWorkspace(approved.workspace, tenant).contracts[0].endDate, '2099-03-06')

  const secondRequest = applyMutation(approved.workspace, tenant, {
    type: 'extension.create',
    payload: { contractId: contract.id, additionalDays: 2, reason: 'Please allow two more days.' },
  })
  const rejected = applyMutation(secondRequest.workspace, admin, {
    type: 'extension.review',
    payload: { id: secondRequest.workspace.extensionRequests[0].id, status: 'Rejected', additionalCost: 0, notes: 'Room is booked.' },
  })
  assert.equal(rejected.workspace.extensionRequests[0].status, 'Rejected')
  assert.equal(rejected.workspace.contracts[0].endDate, '2099-03-06')
})

test('payment submissions stay pending until landlord confirmation', () => {
  const workspace = emptyWorkspace()
  workspace.tenants.push({ id: 't1', active: true })
  workspace.bills.push({
    id: 'b1', tenantId: 't1', month: '2026-10', rent: 2500, power: 0, water: 0, status: 'Pending',
  })
  const submitted = applyMutation(workspace, tenant, {
    type: 'billing.submitPayment',
    payload: {
      id: 'b1',
      method: 'GCash',
      reference: 'GC-12345',
      proof: { name: 'receipt.jpg', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,aA==' },
    },
  })
  assert.equal(submitted.workspace.bills[0].status, 'Pending')
  assert.equal(submitted.workspace.bills[0].reference, 'GC-12345')
  assert.throws(() => applyMutation(submitted.workspace, { id: 'tenant-user-2', role: 'tenant', tenantId: 't2' }, {
    type: 'billing.submitPayment',
    payload: {
      id: 'b1',
      method: 'GCash',
      reference: 'OTHER-TENANT',
      proof: { name: 'receipt.jpg', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,aA==' },
    },
  }), { message: 'You cannot update this bill.' })
})
