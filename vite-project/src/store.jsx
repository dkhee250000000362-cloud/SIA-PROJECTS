/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import harborApi from './api/harborApi'

const EMPTY_WORKSPACE = { rooms: [], tenants: [], bills: [], tickets: [], landlord: null }
const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)

const pad = (value) => String(value).padStart(2, '0')
export const todayStr = () => {
  const date = new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
export const thisMonth = () => todayStr().slice(0, 7)
export const money = (value) =>
  '₱' + Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
export const fmtDate = (value) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
export const monthLabel = (value) =>
  new Date(`${value}-01T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' })
export const billTotal = (bill) => Number(bill.rent) + Number(bill.power) + Number(bill.water)
export const billStatus = (bill) => (bill.status === 'Pending' && bill.due < todayStr() ? 'Overdue' : bill.status)
export const bedLabels = (capacity) => Array.from({ length: capacity }, (_, index) => String.fromCharCode(65 + index))

/** Reads and optimizes an image or PDF before it is sent to the API. */
export function readFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Choose a file to upload.'))
    if (file.size > 10_000_000) return reject(new Error('That file is over 10 MB. Choose a smaller file.'))
    const isImage = file.type.startsWith('image/')
    if (!isImage && file.type !== 'application/pdf') {
      return reject(new Error('Please choose a JPG, PNG or PDF file.'))
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') return reject(new Error('Could not read that file.'))
      if (!isImage) {
        if (file.size > 1_000_000) return reject(new Error('That PDF is over 1 MB. Choose a smaller file.'))
        return resolve({ name: file.name, type: file.type, dataUrl: reader.result })
      }
      const image = new Image()
      image.onerror = () => reject(new Error('That image could not be opened.'))
      image.onload = () => {
        try {
          const max = 1000
          const scale = Math.min(1, max / Math.max(image.width, image.height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(image.width * scale))
          canvas.height = Math.max(1, Math.round(image.height * scale))
          const context = canvas.getContext('2d')
          if (!context) throw new Error('Your browser could not process that image.')
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          resolve({ name: file.name, type: 'image/jpeg', dataUrl: canvas.toDataURL('image/jpeg', 0.7) })
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Could not process that image.'))
        }
      }
      image.src = reader.result
    }
    reader.onabort = () => reject(new Error('File reading was cancelled. Please try again.'))
    reader.readAsDataURL(file)
  })
}

export function roomStats(room, tenants) {
  const occupants = tenants.filter((tenant) => tenant.active && tenant.roomId === room.id)
  const beds = bedLabels(room.capacity).map((label) => ({
    label,
    tenant: occupants.find((tenant) => tenant.bed === label) || null,
    cleaning: (Array.isArray(room.cleaning) ? room.cleaning : []).includes(label),
  }))
  const filled = beds.filter((bed) => bed.tenant).length
  let status = 'Vacant'
  if (room.maintenance) status = 'Maintenance'
  else if (filled === room.capacity) status = 'Occupied'
  else if (filled > 0) status = 'Partially occupied'
  return { beds, filled, status, occupants }
}

export function StoreProvider({ children }) {
  const [data, setData] = useState(EMPTY_WORKSPACE)
  const [session, setSession] = useState(null)
  const [version, setVersion] = useState(0)
  const [ready, setReady] = useState(false)
  const [apiError, setApiError] = useState('')

  useEffect(() => {
    let active = true
    harborApi.getSession()
      .then((result) => {
        if (!active) return
        setData(result.workspace)
        setSession(result.session)
        setVersion(result.version)
        setApiError('')
      })
      .catch((error) => {
        console.error('Could not load the saved workspace', error)
        if (active) setApiError(error.message)
      })
      .finally(() => {
        if (active) setReady(true)
      })
    return () => { active = false }
  }, [])

  const api = useMemo(() => {
    const acceptAuth = (result) => {
      setData(result.workspace)
      setSession(result.session)
      setVersion(result.version)
      setApiError('')
    }
    const authenticate = async (operation) => {
      setApiError('')
      try {
        acceptAuth(await operation())
        return ''
      } catch (error) {
        console.error('Authentication request failed', error)
        setApiError(error.message)
        return error.message
      }
    }
    const mutate = async (type, payload = {}) => {
      setApiError('')
      try {
        const result = await harborApi.mutate(version, { type, payload })
        setData(result.workspace)
        setVersion(result.version)
        return result.result || {}
      } catch (error) {
        console.error(`Could not complete workspace action "${type}"`, error)
        if (error.status === 409) {
          try {
            const current = await harborApi.getSession()
            setData(current.workspace)
            setSession(current.session)
            setVersion(current.version)
          } catch (refreshError) {
            console.error('Could not refresh the workspace after a conflict', refreshError)
          }
        }
        setApiError(error.message)
        return { error: error.message }
      }
    }

    return {
      loginAdmin: (email, password) => authenticate(() => harborApi.login('admin', email, password)),
      loginTenant: (email, password) => authenticate(() => harborApi.login('tenant', email, password)),
      createAdminAccount: (account) => authenticate(() => harborApi.registerAdmin(account)),
      createTenantAccount: (account) => authenticate(() => harborApi.registerTenant(account)),
      async logout() {
        setApiError('')
        try {
          const result = await harborApi.logout()
          setData(result.workspace)
          setSession(null)
          setVersion(result.version)
        } catch (error) {
          console.error('Could not sign out', error)
          setApiError(error.message)
        }
      },
      addRoom: (room) => mutate('room.create', room),
      updateRoom: (id, change) => mutate('room.update', { id, change }),
      archiveRoom: (id) => mutate('room.update', { id, change: { archived: true } }),
      restoreRoom: (id) => mutate('room.update', { id, change: { archived: false } }),
      clearCleaning: (roomId, bed) => mutate('room.clearCleaning', { roomId, bed }),
      addTenant: (tenant) => mutate('tenant.create', { tenant }),
      importTenants: (tenants) => mutate('tenant.import', { tenants }),
      updateTenant: (id, change) => mutate('tenant.update', { id, change }),
      assignTenant: (tenantId, roomId, bed) => mutate('tenant.assign', { tenantId, roomId, bed }),
      moveOut: (tenantId) => mutate('tenant.moveOut', { tenantId }),
      addDoc: (tenantId, doc) => mutate('tenant.addDoc', { tenantId, doc }),
      removeDoc: (tenantId, docId) => mutate('tenant.removeDoc', { tenantId, docId }),
      generateBills: (payload) => mutate('billing.generate', payload),
      setBillStatus: (id, status) => mutate('billing.setStatus', { id, status }),
      attachProof: (id, proof) => mutate('billing.attachProof', { id, proof }),
      addTicket: (ticket) => mutate('ticket.create', ticket),
      setTicketStatus: (id, status) => mutate('ticket.setStatus', { id, status }),
      dismissApiError: () => setApiError(''),
    }
  }, [version])

  return (
    <Ctx.Provider value={{
      ...data,
      ...api,
      session,
      ready,
      apiError,
    }}>
      {children}
    </Ctx.Provider>
  )
}
