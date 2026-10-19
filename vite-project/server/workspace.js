import { randomUUID } from 'node:crypto'

export const emptyWorkspace = () => ({
  rooms: [],
  tenants: [],
  bills: [],
  tickets: [],
  landlord: null,
})

const today = () => new Date().toISOString().slice(0, 10)
const uid = (prefix) => `${prefix}${randomUUID()}`
const bedLabels = (capacity) => Array.from({ length: capacity }, (_, index) => String.fromCharCode(65 + index))
const fail = (message) => {
  const error = new Error(message)
  error.status = 400
  throw error
}
const amount = (value, label) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) fail(`${label} must be a valid non-negative amount.`)
  return parsed
}
const fileIsValid = (file) => {
  if (file == null) return true
  return typeof file.name === 'string' &&
    ['image/jpeg', 'application/pdf'].includes(file.type) &&
    typeof file.dataUrl === 'string' &&
    file.dataUrl.startsWith(`data:${file.type};base64,`) &&
    file.dataUrl.length <= 14_000_000
}
const validDate = (value) => !value || (
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
)

function tenantById(workspace, id) {
  return workspace.tenants.find((tenant) => tenant.id === id)
}

function roomById(workspace, id) {
  return workspace.rooms.find((room) => room.id === id)
}

function isOccupied(workspace, roomId) {
  return workspace.tenants.some((tenant) => tenant.active && tenant.roomId === roomId)
}

function addTenant(workspace, value) {
  if (!value || typeof value !== 'object' || !value.name?.trim()) fail('Enter the boarder’s full name.')
  const email = String(value.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.')
  if (workspace.tenants.some((tenant) => tenant.email?.toLowerCase() === email)) {
    fail('Another boarder already uses that email.')
  }
  const moveIn = String(value.moveIn || '')
  const leaseEnd = String(value.leaseEnd || '')
  if (!validDate(moveIn) || !validDate(leaseEnd)) fail('Enter dates in YYYY-MM-DD format.')
  if (leaseEnd && moveIn && leaseEnd < moveIn) {
    fail('Lease end date must be on or after the move-in date.')
  }
  workspace.tenants.push({
    id: uid('t'),
    active: true,
    roomId: null,
    bed: null,
    docs: [],
    name: value.name.trim(),
    phone: String(value.phone || '').trim(),
    email,
    emergency: String(value.emergency || '').trim(),
    emergencyPhone: String(value.emergencyPhone || '').trim(),
    moveIn,
    leaseEnd,
  })
}

export function applyMutation(source, user, action) {
  if (!action || typeof action.type !== 'string') fail('A valid workspace action is required.')
  if (user.role === 'tenant' && !['billing.attachProof', 'ticket.create'].includes(action.type)) {
    fail('You do not have permission to update this workspace.')
  }
  if (user.role === 'admin' && action.type === 'ticket.create') {
    fail('Only an active boarder can report a repair.')
  }
  const workspace = structuredClone(source)
  const payload = action.payload || {}
  let result = null

  switch (action.type) {
    case 'room.create': {
      const number = String(payload.number || '').trim()
      const capacity = Number(payload.capacity)
      const rate = amount(payload.rate, 'Rent')
      if (!number) fail('Enter a room number.')
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 12) fail('A room must have between 1 and 12 beds.')
      if (workspace.rooms.some((room) => room.number === number && !room.archived)) fail('Another room already uses that number.')
      workspace.rooms.push({ id: uid('r'), number, capacity, rate, maintenance: false, archived: false, cleaning: [] })
      break
    }
    case 'room.update': {
      const room = roomById(workspace, payload.id)
      if (!room) fail('This room could not be found. Refresh and try again.')
      const change = payload.change || {}
      const allowed = ['number', 'capacity', 'rate', 'maintenance', 'archived']
      if (Object.keys(change).some((key) => !allowed.includes(key))) fail('This room update contains unsupported fields.')
      const next = { ...room, ...change }
      if ('number' in change) {
        next.number = String(change.number).trim()
        if (!next.number) fail('Enter a room number.')
        if (workspace.rooms.some((item) => item.id !== room.id && item.number === next.number && !item.archived)) {
          fail('Another room already uses that number.')
        }
      }
      if ('capacity' in change) {
        next.capacity = Number(change.capacity)
        if (!Number.isInteger(next.capacity) || next.capacity < 1 || next.capacity > 12) {
          fail('A room must have between 1 and 12 beds.')
        }
        const occupiedBeds = workspace.tenants.filter((tenant) => tenant.active && tenant.roomId === room.id).length
        if (next.capacity < Math.max(1, occupiedBeds)) fail(`Capacity can’t be below the ${occupiedBeds} beds already in use.`)
      }
      if ('rate' in change) next.rate = amount(change.rate, 'Rent')
      if ('maintenance' in change && typeof change.maintenance !== 'boolean') fail('Room maintenance status must be true or false.')
      if ('archived' in change && typeof change.archived !== 'boolean') fail('Room archive status must be true or false.')
      if (next.archived && isOccupied(workspace, room.id)) fail('Move out the tenants in this room before archiving it.')
      Object.assign(room, next)
      break
    }
    case 'room.clearCleaning': {
      const room = roomById(workspace, payload.roomId)
      if (!room) fail('This room could not be found. Refresh and try again.')
      room.cleaning = (room.cleaning || []).filter((bed) => bed !== payload.bed)
      break
    }
    case 'tenant.create':
      addTenant(workspace, payload.tenant)
      break
    case 'tenant.import': {
      if (!Array.isArray(payload.tenants) || payload.tenants.length > 500) fail('Choose a valid tenant import file.')
      const imported = new Set()
      for (const tenant of payload.tenants) {
        const email = String(tenant.email || '').trim().toLowerCase()
        if (imported.has(email) || workspace.tenants.some((item) => item.email?.toLowerCase() === email)) {
          fail(`An imported boarder already uses ${email || 'an empty email address'}.`)
        }
        imported.add(email)
      }
      payload.tenants.forEach((tenant) => addTenant(workspace, tenant))
      result = { created: payload.tenants.length }
      break
    }
    case 'tenant.update': {
      const tenant = tenantById(workspace, payload.id)
      if (!tenant) fail('This boarder could not be found. Refresh and try again.')
      const change = payload.change || {}
      const allowed = ['name', 'phone', 'email', 'emergency', 'emergencyPhone', 'moveIn', 'leaseEnd', 'active']
      if (Object.keys(change).some((key) => !allowed.includes(key))) fail('This boarder update contains unsupported fields.')
      for (const key of ['name', 'phone', 'email', 'emergency', 'emergencyPhone', 'moveIn', 'leaseEnd']) {
        if (key in change && typeof change[key] !== 'string') fail('Boarder details must be text values.')
      }
      if ('name' in change && !change.name.trim()) fail('Enter the boarder’s full name.')
      if ('email' in change) {
        change.email = String(change.email).trim().toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(change.email)) fail('Enter a valid email address.')
        if (workspace.tenants.some((item) => item.id !== tenant.id && item.email?.toLowerCase() === change.email)) {
          fail('Another boarder already uses that email.')
        }
      }
      const moveIn = change.moveIn ?? tenant.moveIn
      const leaseEnd = change.leaseEnd ?? tenant.leaseEnd
      if (!validDate(moveIn) || !validDate(leaseEnd)) fail('Enter dates in YYYY-MM-DD format.')
      if (leaseEnd && moveIn && leaseEnd < moveIn) {
        fail('Lease end date must be on or after the move-in date.')
      }
      if ('active' in change && typeof change.active !== 'boolean') fail('Boarder active status must be true or false.')
      Object.assign(tenant, change)
      break
    }
    case 'tenant.assign': {
      const tenant = tenantById(workspace, payload.tenantId)
      const room = roomById(workspace, payload.roomId)
      const bed = payload.bed
      if (!tenant?.active || tenant.roomId) fail('Choose an active boarder who is not already assigned.')
      if (!room || room.archived || room.maintenance) fail('This room is unavailable. Refresh and choose another room.')
      if (!bedLabels(room.capacity).includes(bed)) fail('Choose a valid bed in this room.')
      const alreadyOccupied = workspace.tenants.some(
        (item) => item.active && item.roomId === room.id && item.bed === bed,
      )
      if (alreadyOccupied || (room.cleaning || []).includes(bed)) fail('That bed is no longer available. Choose another bed.')
      tenant.roomId = room.id
      tenant.bed = bed
      break
    }
    case 'tenant.moveOut': {
      const tenant = tenantById(workspace, payload.tenantId)
      if (!tenant) fail('This boarder could not be found. Refresh and try again.')
      if (tenant.roomId && tenant.bed) {
        const room = roomById(workspace, tenant.roomId)
        if (room) room.cleaning = [...new Set([...(room.cleaning || []), tenant.bed])]
      }
      tenant.active = false
      tenant.roomId = null
      tenant.bed = null
      break
    }
    case 'tenant.addDoc': {
      const tenant = tenantById(workspace, payload.tenantId)
      if (!tenant || !payload.doc || !fileIsValid(payload.doc)) fail('Choose a valid document to upload.')
      tenant.docs = [...(tenant.docs || []), { id: uid('d'), uploadedAt: today(), ...payload.doc }]
      break
    }
    case 'tenant.removeDoc': {
      const tenant = tenantById(workspace, payload.tenantId)
      if (!tenant) fail('This boarder could not be found. Refresh and try again.')
      tenant.docs = (tenant.docs || []).filter((doc) => doc.id !== payload.docId)
      break
    }
    case 'billing.generate': {
      const room = roomById(workspace, payload.roomId)
      const occupants = workspace.tenants.filter((tenant) => tenant.active && tenant.roomId === payload.roomId)
      const month = String(payload.month || '')
      if (!room || occupants.length === 0) fail('That room has no active tenants to bill.')
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('Choose a valid billing month.')
      const power = amount(payload.power, 'Electricity')
      const water = amount(payload.water, 'Water')
      const fresh = occupants.filter((tenant) => !workspace.bills.some((bill) => bill.tenantId === tenant.id && bill.month === month))
      if (!fresh.length) fail(`Every tenant in Room ${room.number} already has a bill for ${month}.`)
      const perHead = Math.round((power / occupants.length) * 100) / 100
      const created = fresh.map((tenant) => ({
        id: uid('b'), tenantId: tenant.id, month, rent: Number(room.rate), power: perHead, water,
        status: 'Pending', due: `${month}-05`, proof: null, createdAt: today(),
      }))
      workspace.bills.push(...created)
      result = { created: created.length, skipped: occupants.length - fresh.length, perHead }
      break
    }
    case 'billing.setStatus': {
      const bill = workspace.bills.find((item) => item.id === payload.id)
      if (!bill) fail('This bill could not be found. Refresh and try again.')
      if (!['Pending', 'Paid', 'Overdue'].includes(payload.status)) fail('Choose a valid payment status.')
      bill.status = payload.status
      break
    }
    case 'billing.attachProof': {
      const bill = workspace.bills.find((item) => item.id === payload.id)
      if (!bill || !payload.proof || !fileIsValid(payload.proof)) fail('Choose a valid receipt to upload.')
      if (user.role === 'tenant' && (bill.tenantId !== user.tenantId || bill.status === 'Paid')) {
        fail('You cannot update this bill.')
      }
      bill.proof = payload.proof
      break
    }
    case 'ticket.create': {
      if (user.role !== 'tenant' || !tenantById(workspace, user.tenantId)) fail('Only an active boarder can report a repair.')
      const { category, description, photo } = payload
      if (!['Plumbing', 'Electric', 'Wi-Fi', 'Aircon', 'Other'].includes(category)) fail('Choose a valid repair category.')
      if (typeof description !== 'string' || !description.trim()) fail('Describe the problem before sending the request.')
      if (!fileIsValid(photo)) fail('Choose a valid image for the repair request.')
      workspace.tickets.unshift({
        id: uid('k'), tenantId: user.tenantId, category, description: description.trim(),
        status: 'Open', createdAt: today(), photo: photo || null,
      })
      break
    }
    case 'ticket.setStatus': {
      if (user.role !== 'admin') fail('Only the landlord can update repair status.')
      const ticket = workspace.tickets.find((item) => item.id === payload.id)
      if (!ticket) fail('This repair request could not be found. Refresh and try again.')
      if (!['Open', 'In Progress', 'Resolved'].includes(payload.status)) fail('Choose a valid repair status.')
      ticket.status = payload.status
      break
    }
    default:
      fail('This workspace action is not supported.')
  }

  if (user.role === 'tenant' && !tenantById(workspace, user.tenantId)?.active && action.type !== 'billing.attachProof') {
    fail('This boarder account is inactive.')
  }

  return { workspace, result }
}

export function visibleWorkspace(workspace, user) {
  if (!user) {
    return {
      ...emptyWorkspace(),
      landlord: workspace.landlord ? {
        name: workspace.landlord.name,
        propertyName: workspace.landlord.propertyName,
      } : null,
    }
  }
  if (user.role === 'admin') return structuredClone(workspace)
  const tenant = workspace.tenants.find((item) => item.id === user.tenantId)
  return {
    rooms: workspace.rooms.filter((room) => tenant?.roomId === room.id).map((room) => structuredClone(room)),
    tenants: tenant ? [structuredClone(tenant)] : [],
    bills: workspace.bills.filter((bill) => bill.tenantId === user.tenantId).map((bill) => structuredClone(bill)),
    tickets: workspace.tickets.filter((ticket) => ticket.tenantId === user.tenantId).map((ticket) => structuredClone(ticket)),
    landlord: workspace.landlord ? {
      name: workspace.landlord.name,
      propertyName: workspace.landlord.propertyName,
    } : null,
  }
}
