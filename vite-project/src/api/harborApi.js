const API_BASE_URL = '/api'

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'same-origin',
      ...options,
    })
  } catch (error) {
    console.error(`Network request failed: ${path}`, error)
    throw new Error('Could not reach the server. Check your connection and try again.', { cause: error })
  }

  let body
  try {
    body = await response.json()
  } catch (error) {
    console.error(`Invalid API response: ${path}`, error)
    throw new Error('The server returned an invalid response. Please try again.', { cause: error })
  }

  if (!response.ok) {
    const error = new Error(body.error || `Request failed with status ${response.status}.`)
    error.status = response.status
    throw error
  }
  return body
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

function mutationRequest(action) {
  const payload = action.payload
  const id = (value) => encodeURIComponent(value)
  switch (action.type) {
    case 'room.create':
      return { method: 'POST', path: '/rooms', payload }
    case 'room.update':
      return { method: 'PUT', path: `/rooms/${id(payload.id)}`, payload: { change: payload.change } }
    case 'room.clearCleaning':
      return { method: 'PUT', path: `/rooms/${id(payload.roomId)}/cleaning/${id(payload.bed)}`, payload: {} }
    case 'tenant.create':
      return { method: 'POST', path: '/tenants', payload }
    case 'tenant.import':
      return { method: 'POST', path: '/tenants/import', payload }
    case 'tenant.update':
      return { method: 'PUT', path: `/tenants/${id(payload.id)}`, payload: { change: payload.change } }
    case 'tenant.assign':
      return { method: 'PUT', path: `/tenants/${id(payload.tenantId)}/assignment`, payload: { roomId: payload.roomId, bed: payload.bed } }
    case 'tenant.moveOut':
      return { method: 'PUT', path: `/tenants/${id(payload.tenantId)}/move-out`, payload: {} }
    case 'tenant.addDoc':
      return { method: 'POST', path: `/tenants/${id(payload.tenantId)}/documents`, payload: { doc: payload.doc } }
    case 'tenant.removeDoc':
      return { method: 'DELETE', path: `/tenants/${id(payload.tenantId)}/documents/${id(payload.docId)}`, payload: {} }
    case 'billing.generate':
      return { method: 'POST', path: '/bills/generate', payload }
    case 'billing.setStatus':
      return { method: 'PUT', path: `/bills/${id(payload.id)}/status`, payload: { status: payload.status } }
    case 'billing.attachProof':
      return { method: 'PUT', path: `/bills/${id(payload.id)}/proof`, payload: { proof: payload.proof } }
    case 'ticket.create':
      return { method: 'POST', path: '/tickets', payload }
    case 'ticket.setStatus':
      return { method: 'PUT', path: `/tickets/${id(payload.id)}/status`, payload: { status: payload.status } }
    default:
      throw new Error(`Unsupported workspace action: ${action.type}`)
  }
}

export const harborApi = {
  getSession: () => request('/session'),
  registerAdmin: (payload) => request('/auth/admin/register', json('POST', payload)),
  registerTenant: (payload) => request('/auth/tenant/register', json('POST', payload)),
  login: (role, email, password) => request('/auth/login', json('POST', { role, email, password })),
  logout: () => request('/auth/logout', json('POST', {})),
  mutate(version, action) {
    const mutation = mutationRequest(action)
    return request(mutation.path, json(mutation.method, { version, payload: mutation.payload }))
  },
}

export default harborApi
