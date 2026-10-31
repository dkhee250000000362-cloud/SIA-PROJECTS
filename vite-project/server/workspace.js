import { randomUUID } from 'node:crypto'

export const emptyWorkspace = () => ({
  rooms: [],
  tenants: [],
  bills: [],
  tickets: [],
  properties: [],
  bookingRequests: [],
  contracts: [],
  extensionRequests: [],
  auditLog: [],
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
    ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) &&
    typeof file.dataUrl === 'string' &&
    file.dataUrl.startsWith(`data:${file.type};base64,`) &&
    file.dataUrl.length <= 14_000_000
}
const validDate = (value) => !value || (
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
)
const inclusiveDays = (startDate, endDate) =>
  Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1
const contractFields = [
  'landlordName', 'landlordEmail', 'landlordPhone', 'tenantName', 'tenantEmail', 'tenantPhone',
  'propertyName', 'propertyAddress', 'roomNumber', 'monthlyRent', 'securityDeposit', 'paymentTerms',
  'startDate', 'endDate', 'durationMonths', 'houseRules', 'additionalNotes',
]

function validateContractDraft(contract, change = {}) {
  if (Object.keys(change).some((key) => !contractFields.includes(key))) {
    fail('This contract update contains unsupported fields.')
  }
  const next = { ...contract, ...change }
  if (!String(next.landlordName || '').trim() || !String(next.tenantName || '').trim() ||
      !String(next.propertyName || '').trim() || !String(next.propertyAddress || '').trim()) {
    fail('Landlord, tenant, property, and address details are required.')
  }
  if (![next.landlordEmail, next.tenantEmail].every((email) =>
    typeof email === 'string' && (!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) {
    fail('Enter valid landlord and tenant email addresses.')
  }
  if (!validDate(next.startDate) || !validDate(next.endDate) || next.endDate < next.startDate) {
    fail('Enter valid contract dates, with the end date on or after the start date.')
  }
  next.monthlyRent = amount(next.monthlyRent, 'Monthly rent')
  next.securityDeposit = amount(next.securityDeposit, 'Security deposit')
  next.durationMonths = Number(next.durationMonths)
  if (!Number.isInteger(next.durationMonths) || next.durationMonths < 1 || next.durationMonths > 60) {
    fail('Contract duration must be between 1 and 60 months.')
  }
  for (const key of ['landlordName', 'landlordEmail', 'landlordPhone', 'tenantName', 'tenantEmail', 'tenantPhone',
    'propertyName', 'propertyAddress', 'roomNumber', 'paymentTerms', 'houseRules', 'additionalNotes']) {
    if (typeof next[key] !== 'string') fail(`Contract ${key} must be text.`)
  }
  for (const key of ['paymentTerms', 'houseRules', 'additionalNotes']) {
    if (next[key].length > 5000) fail(`${key} must be 5,000 characters or fewer.`)
  }
  next.durationDays = inclusiveDays(next.startDate, next.endDate)
  return next
}

function tenantById(workspace, id) {
  return workspace.tenants.find((tenant) => tenant.id === id)
}

function roomById(workspace, id) {
  return workspace.rooms.find((room) => room.id === id)
}

function isOccupied(workspace, roomId) {
  return workspace.tenants.some((tenant) => tenant.active && tenant.roomId === roomId)
}

function roomHasAvailability(workspace, room) {
  if (!room || room.archived || room.maintenance) return false
  const occupied = workspace.tenants.filter((tenant) => tenant.active && tenant.roomId === room.id).length
  return occupied < room.capacity && (room.cleaning || []).length < room.capacity - occupied
}

function rentalEndDate(startDate, durationMonths) {
  const start = new Date(`${startDate}T00:00:00Z`)
  const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + durationMonths, 1))
  const lastDay = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)).getUTCDate()
  const end = new Date(Date.UTC(
    nextMonth.getUTCFullYear(),
    nextMonth.getUTCMonth(),
    Math.min(start.getUTCDate(), lastDay),
  ))
  end.setUTCDate(end.getUTCDate() - 1)
  return end.toISOString().slice(0, 10)
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
  if (user.role === 'tenant' && ![
    'billing.attachProof', 'billing.submitPayment', 'ticket.create', 'property.inquiry',
    'contract.decide', 'extension.create', 'extension.cancel',
  ].includes(action.type)) {
    fail('You do not have permission to update this workspace.')
  }
  if (user.role === 'admin' && action.type === 'ticket.create') fail('Only an active boarder can report a repair.')
  if (user.role === 'admin' && action.type === 'property.inquiry') fail('Only an active boarder can send an inquiry.')
  if (user.role === 'admin' && ['contract.decide', 'extension.create', 'extension.cancel'].includes(action.type)) {
    fail('Only the tenant can respond to their contract or extension request.')
  }
  if (user.role === 'tenant' && ['contract.create', 'contract.update', 'contract.send', 'extension.review'].includes(action.type)) {
    fail('Only the landlord can manage rental contracts and extension requests.')
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
      bill.paidAt = payload.status === 'Paid' ? today() : null
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
    case 'billing.submitPayment': {
      const bill = workspace.bills.find((item) => item.id === payload.id)
      if (!bill || bill.status === 'Paid') fail('This bill is not available for payment submission.')
      if (user.role === 'tenant' && bill.tenantId !== user.tenantId) fail('You cannot update this bill.')
      if (!['Cash', 'GCash', 'Maya', 'Bank transfer', 'Other'].includes(payload.method)) fail('Choose a valid payment method.')
      if (typeof payload.reference !== 'string' || !payload.reference.trim()) fail('Enter your payment reference.')
      if (!payload.proof || !fileIsValid(payload.proof) || payload.proof.type === 'application/pdf') {
        fail('Upload a JPG or PNG proof of payment.')
      }
      bill.proof = payload.proof
      bill.paymentMethod = payload.method
      bill.reference = payload.reference.trim()
      bill.submittedAt = today()
      break
    }
    case 'ticket.create': {
      const tenant = tenantById(workspace, user.tenantId)
      if (user.role !== 'tenant' || !tenant?.active) fail('Only an active boarder can report a repair.')
      const { category, description, photo } = payload
      const categories = [
        'Plumbing', 'Electrical', 'Wi-Fi / Internet', 'Air conditioning', 'Furniture',
        'Structural damage', 'Cleanliness', 'Safety concern', 'Other',
      ]
      if (!categories.includes(category)) fail('Choose a valid repair category.')
      if (typeof description !== 'string' || !description.trim()) fail('Describe the problem before sending the request.')
      if (description.trim().length > 5000) fail('Keep the report description under 5,000 characters.')
      if (photo && (!fileIsValid(photo) || !['image/jpeg', 'image/png'].includes(photo.type))) {
        fail('Choose a valid JPG or PNG image for the repair request.')
      }
      const assignedProperty = (workspace.properties || []).find((property) =>
        property.id === tenant.propertyId || (tenant.roomId && property.roomIds?.includes(tenant.roomId)))
      const propertyId = Object.hasOwn(payload, 'propertyId') ? payload.propertyId : assignedProperty?.id || null
      if (propertyId != null && (typeof propertyId !== 'string' || propertyId !== assignedProperty?.id)) {
        fail('Choose your assigned property or submit a general report.')
      }
      const propertyLocation = typeof payload.propertyLocation === 'string' ? payload.propertyLocation.trim() : ''
      const specificLocation = typeof payload.specificLocation === 'string' ? payload.specificLocation.trim() : ''
      if (propertyLocation.length > 240 || specificLocation.length > 240) {
        fail('Keep property and room locations under 240 characters.')
      }
      const roomId = assignedProperty?.roomIds?.includes(tenant.roomId) ? tenant.roomId : null
      workspace.tickets.unshift({
        id: uid('k'), tenantId: user.tenantId,
        roomId: propertyId && assignedProperty?.id === propertyId ? roomId : null,
        propertyId, propertyLocation, specificLocation, category, description: description.trim(),
        status: 'Pending', createdAt: today(), photo: photo || null, response: '',
      })
      break
    }
    case 'ticket.setStatus': {
      if (user.role !== 'admin') fail('Only the landlord can update repair status.')
      const ticket = workspace.tickets.find((item) => item.id === payload.id)
      if (!ticket) fail('This repair request could not be found. Refresh and try again.')
      if (!['Pending', 'Open', 'In Progress', 'Resolved'].includes(payload.status)) fail('Choose a valid repair status.')
      ticket.status = payload.status
      break
    }
    case 'ticket.respond': {
      if (user.role !== 'admin') fail('Only the landlord can respond to a repair request.')
      const ticket = workspace.tickets.find((item) => item.id === payload.id)
      if (!ticket) fail('This repair request could not be found.')
      if (typeof payload.response !== 'string' || !payload.response.trim()) fail('Enter a response before sending it.')
      ticket.response = payload.response.trim()
      ticket.respondedAt = today()
      break
    }
    case 'property.create': {
      const property = validateProperty(payload)
      if (property.roomIds.some((id) => !roomById(workspace, id) || roomById(workspace, id).archived)) {
        fail('Choose existing, active rooms for this listing.')
      }
      if (property.published && !property.roomIds.length) fail('Add at least one room before publishing this listing.')
      if (property.roomIds.some((id) => (workspace.properties || []).some((item) => item.roomIds?.includes(id)))) {
        fail('Each room can belong to only one property listing.')
      }
      property.id = uid('p')
      property.published = property.published === true
      property.createdAt = today()
      workspace.properties = [...(workspace.properties || []), property]
      result = { id: property.id }
      break
    }
    case 'property.update': {
      const property = (workspace.properties || []).find((item) => item.id === payload.id)
      if (!property) fail('This listing could not be found. Refresh and try again.')
      const change = payload.change || {}
      const allowed = ['name', 'address', 'city', 'description', 'rules', 'amenities', 'images', 'monthlyRate', 'roomIds', 'published']
      if (Object.keys(change).some((key) => !allowed.includes(key))) fail('This listing update contains unsupported fields.')
      const next = validateProperty({ ...property, ...change })
      if (next.roomIds.some((id) => !roomById(workspace, id) || roomById(workspace, id).archived)) {
        fail('Choose existing, active rooms for this listing.')
      }
      if (next.roomIds.some((id) => (workspace.properties || []).some((item) =>
        item.id !== property.id && item.roomIds?.includes(id)))) {
        fail('Each room can belong to only one property listing.')
      }
      if ('published' in change) {
        if (typeof change.published !== 'boolean') fail('Listing status must be published or unpublished.')
        if (change.published && !next.roomIds.length) fail('Add at least one room before publishing this listing.')
        next.published = change.published
      }
      Object.assign(property, next)
      break
    }
    case 'property.delete': {
      const property = (workspace.properties || []).find((item) => item.id === payload.id)
      if (!property) fail('This listing could not be found. Refresh and try again.')
      if ((workspace.bookingRequests || []).some((request) =>
        request.propertyId === property.id && !['Declined', 'Rejected'].includes(request.status))) {
        fail('Resolve or decline booking inquiries before deleting this listing.')
      }
      workspace.properties = workspace.properties.filter((item) => item.id !== property.id)
      break
    }
    case 'property.inquiry': {
      const tenant = tenantById(workspace, user.tenantId)
      if (user.role !== 'tenant' || !tenant?.active) fail('Only an active boarder can send an inquiry.')
      const property = (workspace.properties || []).find((item) => item.id === payload.propertyId && item.published)
      if (!property) fail('This listing is not available.')
      const requestedRoomId = payload.roomId || null
      if (requestedRoomId && !property.roomIds.includes(requestedRoomId)) fail('Choose a room from this property listing.')
      const candidateRoomIds = requestedRoomId ? [requestedRoomId] : property.roomIds
      const available = candidateRoomIds.some((id) => roomHasAvailability(workspace, roomById(workspace, id)))
      if (!available) fail(requestedRoomId ? 'This room is no longer available.' : 'This listing no longer has available rooms.')
      const pending = (workspace.bookingRequests || []).some((item) =>
        item.tenantId === user.tenantId && item.propertyId === property.id &&
        ['Pending', 'Under Review', 'Contacted', 'Accepted', 'Approved', 'Contract Sent'].includes(item.status))
      if (pending) fail('You already have an active inquiry for this listing.')
      const message = typeof payload.message === 'string' ? payload.message.trim() : ''
      const moveInDate = String(payload.moveInDate || '')
      const durationMonths = Number(payload.durationMonths)
      if (!validDate(moveInDate)) fail('Choose a valid desired move-in date.')
      if (moveInDate < today()) fail('Desired move-in date cannot be in the past.')
      if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 60) {
        fail('Rental duration must be between 1 and 60 months.')
      }
      if (message.length > 2000) fail('Keep your message under 2,000 characters.')
      workspace.bookingRequests = [{
        id: uid('q'), propertyId: property.id, roomId: requestedRoomId, tenantId: user.tenantId,
        tenantName: tenant.name, tenantEmail: tenant.email, tenantPhone: tenant.phone || '',
        moveInDate, durationMonths, message,
        status: 'Pending', createdAt: today(), response: '',
      }, ...(workspace.bookingRequests || [])]
      break
    }
    case 'booking.update': {
      const inquiry = (workspace.bookingRequests || []).find((item) => item.id === payload.id)
      if (!inquiry) fail('This inquiry could not be found. Refresh and try again.')
      const status = ({ Contacted: 'Under Review', Approved: 'Accepted', Declined: 'Rejected' })[payload.status] || payload.status
      if (!['Pending', 'Under Review', 'Accepted', 'Rejected', 'Contract Sent'].includes(status)) fail('Choose a valid inquiry status.')
      if (status === 'Contract Sent') fail('Send a rental contract to update this inquiry to Contract Sent.')
      if (status === 'Accepted' && !['Accepted', 'Contract Sent'].includes(inquiry.status)) {
        const property = (workspace.properties || []).find((item) => item.id === inquiry.propertyId)
        const room = inquiry.roomId && roomById(workspace, inquiry.roomId)
        if (!property || (inquiry.roomId && !roomHasAvailability(workspace, room))) {
          fail('The requested property or room is no longer available.')
        }
      }
      inquiry.status = status
      inquiry.response = typeof payload.response === 'string' ? payload.response.trim() : inquiry.response || ''
      break
    }
    case 'contract.create': {
      if (user.role !== 'admin') fail('Only the landlord can prepare a rental contract.')
      const inquiry = (workspace.bookingRequests || []).find((item) => item.id === payload.inquiryId)
      if (!inquiry || !['Accepted', 'Approved'].includes(inquiry.status)) fail('Accept the inquiry before preparing a contract.')
      if ((workspace.contracts || []).some((contract) => contract.inquiryId === inquiry.id)) {
        fail('A contract already exists for this inquiry.')
      }
      const tenant = tenantById(workspace, inquiry.tenantId)
      const property = (workspace.properties || []).find((item) => item.id === inquiry.propertyId)
      const room = inquiry.roomId ? roomById(workspace, inquiry.roomId) : null
      if (!tenant?.active || !property || (inquiry.roomId && !roomHasAvailability(workspace, room))) {
        fail('The active tenant, property, or requested room is no longer available.')
      }
      const startDate = inquiry.moveInDate || today()
      const durationMonths = Number(inquiry.durationMonths) || 1
      const endDate = rentalEndDate(startDate, durationMonths)
      let contractNumber
      do {
        contractNumber = `AFF-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`
      } while ((workspace.contracts || []).some((item) => item.contractNumber === contractNumber))
      const contract = {
        id: uid('c'),
        contractNumber,
        inquiryId: inquiry.id,
        tenantId: tenant.id,
        propertyId: property.id,
        roomId: room?.id || null,
        landlordName: workspace.landlord?.name || user.name || 'Landlord',
        landlordEmail: workspace.landlord?.email || user.email || '',
        landlordPhone: workspace.landlord?.phone || '',
        tenantName: tenant.name,
        tenantEmail: tenant.email,
        tenantPhone: tenant.phone || '',
        propertyName: property.name,
        propertyAddress: [property.address, property.city].filter(Boolean).join(', '),
        roomNumber: room?.number || '',
        monthlyRent: Number(room?.rate ?? property.monthlyRate) || 0,
        securityDeposit: 0,
        paymentTerms: 'Rent is due monthly in advance. Payment is made directly to the landlord.',
        startDate,
        endDate,
        durationMonths,
        durationDays: inclusiveDays(startDate, endDate),
        houseRules: property.rules || '',
        additionalNotes: '',
        status: 'Draft',
        createdAt: new Date().toISOString(),
        sentAt: null,
        acceptedAt: null,
        signature: '',
        endDateHistory: [],
      }
      workspace.contracts = [contract, ...(workspace.contracts || [])]
      result = { contractId: contract.id }
      break
    }
    case 'contract.update': {
      if (user.role !== 'admin') fail('Only the landlord can edit a rental contract.')
      const contract = (workspace.contracts || []).find((item) => item.id === payload.id)
      if (!contract) fail('This contract could not be found.')
      if (contract.status !== 'Draft') fail('Only draft contracts can be edited.')
      Object.assign(contract, validateContractDraft(contract, payload.change || {}))
      break
    }
    case 'contract.send': {
      if (user.role !== 'admin') fail('Only the landlord can send a rental contract.')
      const contract = (workspace.contracts || []).find((item) => item.id === payload.id)
      if (!contract || contract.status !== 'Draft') fail('Only a draft contract can be sent.')
      Object.assign(contract, validateContractDraft(contract, payload.change || {}))
      if (contract.roomId && !roomHasAvailability(workspace, roomById(workspace, contract.roomId))) {
        fail('The requested room is no longer available. Review the inquiry before sending the contract.')
      }
      contract.status = 'Awaiting Tenant Acceptance'
      contract.sentAt = new Date().toISOString()
      const inquiry = (workspace.bookingRequests || []).find((item) => item.id === contract.inquiryId)
      if (inquiry) inquiry.status = 'Contract Sent'
      break
    }
    case 'contract.setStatus': {
      if (user.role !== 'admin') fail('Only the landlord can update a contract status.')
      const contract = (workspace.contracts || []).find((item) => item.id === payload.id)
      if (!contract) fail('This contract could not be found.')
      const allowedTransitions = {
        'Awaiting Tenant Acceptance': ['Expired'],
        Accepted: ['Completed', 'Expired'],
      }
      if (!allowedTransitions[contract.status]?.includes(payload.status)) {
        fail('This contract cannot be moved to that status.')
      }
      contract.status = payload.status
      contract.statusUpdatedAt = new Date().toISOString()
      break
    }
    case 'contract.decide': {
      if (user.role !== 'tenant') fail('Only the tenant can respond to a rental contract.')
      const contract = (workspace.contracts || []).find((item) => item.id === payload.id && item.tenantId === user.tenantId)
      if (!contract || contract.status !== 'Awaiting Tenant Acceptance') fail('This contract is not awaiting your response.')
      if (!['Accepted', 'Rejected'].includes(payload.decision)) fail('Choose accept or reject.')
      if (payload.decision === 'Accepted' && contract.roomId &&
          !roomHasAvailability(workspace, roomById(workspace, contract.roomId))) {
        fail('The requested room is no longer available. Contact the landlord before accepting this contract.')
      }
      if (payload.decision === 'Accepted' && (typeof payload.signature !== 'string' || payload.signature.trim().length < 2)) {
        fail('Enter your full name as your electronic signature to accept.')
      }
      if (payload.decision === 'Accepted' &&
          payload.signature.trim().toLocaleLowerCase() !== (tenantById(workspace, user.tenantId)?.name || '').trim().toLocaleLowerCase()) {
        fail('Your electronic signature must match your registered tenant name.')
      }
      contract.status = payload.decision
      contract.acceptedAt = payload.decision === 'Accepted' ? new Date().toISOString() : null
      contract.rejectedAt = payload.decision === 'Rejected' ? new Date().toISOString() : null
      contract.signature = payload.decision === 'Accepted' ? payload.signature.trim() : ''
      const inquiry = (workspace.bookingRequests || []).find((item) => item.id === contract.inquiryId)
      if (inquiry) inquiry.status = payload.decision
      break
    }
    case 'extension.create': {
      if (user.role !== 'tenant') fail('Only the tenant can request a contract extension.')
      const contract = (workspace.contracts || []).find((item) => item.id === payload.contractId && item.tenantId === user.tenantId)
      if (!contract || contract.status !== 'Accepted') fail('Only an accepted contract can be extended.')
      if (contract.endDate < today()) fail('This contract has ended and can no longer be extended.')
      const additionalDays = Number(payload.additionalDays)
      if (!Number.isInteger(additionalDays) || additionalDays < 1 || additionalDays > 365) {
        fail('Request between 1 and 365 additional days.')
      }
      if (typeof payload.reason !== 'string' || !payload.reason.trim() || payload.reason.trim().length > 2000) {
        fail('Enter a reason for your extension (up to 2,000 characters).')
      }
      if ((workspace.extensionRequests || []).some((request) =>
        request.contractId === contract.id && request.status === 'Pending')) {
        fail('There is already a pending extension request for this contract.')
      }
      const newEndDate = new Date(`${contract.endDate}T00:00:00Z`)
      newEndDate.setUTCDate(newEndDate.getUTCDate() + additionalDays)
      const additionalCost = Math.round((Number(contract.monthlyRent) / 30 * additionalDays) * 100) / 100
      const extension = {
        id: uid('x'),
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        tenantId: contract.tenantId,
        originalEndDate: contract.endDate,
        additionalDays,
        requestedEndDate: newEndDate.toISOString().slice(0, 10),
        reason: payload.reason.trim(),
        submittedAt: new Date().toISOString(),
        proposedAdditionalCost: additionalCost,
        additionalCost,
        status: 'Pending',
        landlordNotes: '',
      }
      workspace.extensionRequests = [extension, ...(workspace.extensionRequests || [])]
      result = { extensionId: extension.id }
      break
    }
    case 'extension.review': {
      if (user.role !== 'admin') fail('Only the landlord can review extension requests.')
      const extension = (workspace.extensionRequests || []).find((item) => item.id === payload.id)
      if (!extension || extension.status !== 'Pending') fail('This extension request is no longer pending.')
      if (!['Approved', 'Rejected'].includes(payload.status)) fail('Choose approve or reject.')
      const contract = (workspace.contracts || []).find((item) => item.id === extension.contractId)
      if (!contract || contract.status !== 'Accepted' || contract.endDate !== extension.originalEndDate) {
        fail('The contract changed after this request. Refresh before reviewing it.')
      }
      const additionalCost = amount(payload.additionalCost, 'Additional rental charge')
      const notes = typeof payload.notes === 'string' ? payload.notes.trim() : ''
      if (notes.length > 2000) fail('Keep extension notes under 2,000 characters.')
      extension.status = payload.status
      extension.additionalCost = additionalCost
      extension.landlordNotes = notes
      extension.reviewedAt = new Date().toISOString()
      if (payload.status === 'Approved') {
        contract.endDateHistory = [...(contract.endDateHistory || []), {
          previousEndDate: contract.endDate,
          newEndDate: extension.requestedEndDate,
          additionalDays: extension.additionalDays,
          approvedAt: extension.reviewedAt,
          additionalCost,
          notes,
        }]
        contract.endDate = extension.requestedEndDate
        contract.durationDays = inclusiveDays(contract.startDate, contract.endDate)
      }
      break
    }
    case 'extension.cancel': {
      if (user.role !== 'tenant') fail('Only the tenant can cancel their extension request.')
      const extension = (workspace.extensionRequests || []).find((item) =>
        item.id === payload.id && item.tenantId === user.tenantId)
      if (!extension || extension.status !== 'Pending') fail('Only a pending extension request can be cancelled.')
      extension.status = 'Cancelled'
      extension.cancelledAt = new Date().toISOString()
      break
    }
    default:
      fail('This workspace action is not supported.')
  }

  if (user.role === 'tenant' && !tenantById(workspace, user.tenantId)?.active && action.type !== 'billing.attachProof') {
    fail('This boarder account is inactive.')
  }

  const auditLog = workspace.auditLog || []
  auditLog.unshift({
    id: uid('a'),
    actorId: user.id,
    actorRole: user.role,
    action: action.type,
    createdAt: new Date().toISOString(),
  })
  workspace.auditLog = auditLog.slice(0, 500)

  return { workspace, result }
}

function validateProperty(value) {
  const property = { ...value }
  for (const field of ['name', 'address', 'city', 'description', 'rules']) {
    if (typeof property[field] !== 'string') property[field] = ''
    property[field] = property[field].trim()
  }
  if (!property.name || !property.address || !property.city) fail('Enter the listing name, full address, and city.')
  if (!Array.isArray(property.amenities) || property.amenities.some((item) => typeof item !== 'string')) {
    fail('Enter a valid amenities list.')
  }
  if (!Array.isArray(property.images) || property.images.length > 10 || property.images.some((image) =>
    !image || image.type !== 'image/jpeg' || !fileIsValid(image))) {
    fail('Choose up to 10 valid JPG or PNG property photos.')
  }
  if (!Array.isArray(property.roomIds) || property.roomIds.some((id) => typeof id !== 'string')) {
    fail('Choose valid rooms for this listing.')
  }
  if ('published' in property && typeof property.published !== 'boolean') fail('Listing status must be published or unpublished.')
  property.monthlyRate = amount(property.monthlyRate, 'Monthly rent')
  property.amenities = [...new Set(property.amenities.map((item) => item.trim()).filter(Boolean))]
  property.roomIds = [...new Set(property.roomIds)]
  return property
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
  const publishedProperties = (workspace.properties || []).filter((property) => property.published)
  const assignedProperty = (workspace.properties || []).find((property) =>
    property.id === tenant?.propertyId || (tenant?.roomId && property.roomIds?.includes(tenant.roomId)))
  const properties = [...publishedProperties, ...(assignedProperty && !publishedProperties.some((property) => property.id === assignedProperty.id)
    ? [assignedProperty]
    : [])].map((property) => ({
    ...structuredClone(property),
    availableBeds: propertyAvailableBeds(workspace, property),
  }))
  const publicRoomIds = new Set(publishedProperties.flatMap((property) => property.roomIds || []))
  const tenantRoomIds = new Set(tenant?.roomId ? [tenant.roomId] : [])
  return {
    rooms: workspace.rooms
      .filter((room) => tenantRoomIds.has(room.id) || publicRoomIds.has(room.id))
      .map((room) => ({ ...structuredClone(room), availableBeds: roomAvailableBeds(workspace, room) })),
    tenants: tenant ? [structuredClone(tenant)] : [],
    bills: workspace.bills.filter((bill) => bill.tenantId === user.tenantId).map((bill) => structuredClone(bill)),
    tickets: workspace.tickets.filter((ticket) => ticket.tenantId === user.tenantId).map((ticket) => structuredClone(ticket)),
    properties,
    bookingRequests: (workspace.bookingRequests || []).filter((request) => request.tenantId === user.tenantId).map((request) => structuredClone(request)),
    contracts: (workspace.contracts || []).filter((contract) => contract.tenantId === user.tenantId).map((contract) => structuredClone(contract)),
    extensionRequests: (workspace.extensionRequests || [])
      .filter((request) => request.tenantId === user.tenantId)
      .map((request) => structuredClone(request)),
    landlord: workspace.landlord ? {
      name: workspace.landlord.name,
      propertyName: workspace.landlord.propertyName,
    } : null,
  }
}

function propertyAvailableBeds(workspace, property) {
  return (property.roomIds || []).reduce((total, id) => {
    const room = roomById(workspace, id)
    return total + (room ? roomAvailableBeds(workspace, room) : 0)
  }, 0)
}

function roomAvailableBeds(workspace, room) {
  if (room.archived || room.maintenance) return 0
  const occupied = workspace.tenants.filter((item) => item.active && item.roomId === room.id).length
  return Math.max(0, room.capacity - occupied - (room.cleaning || []).length)
}
