import { useState } from 'react'
import {
  useStore, roomStats, money, fmtDate, monthLabel, billTotal, billStatus, thisMonth, todayStr,
} from '../store'
import { Badge, Modal, Field, UploadButton, FileView, Empty } from '../ui'
import TenantExcelImport from './TenantExcelImport'

const NAV = ['Overview', 'Rooms', 'Tenants', 'Billing', 'Maintenance']
const CATEGORY_ICON = { Plumbing: '🚰', Electric: '💡', 'Wi-Fi': '📶', Aircon: '❄️', Other: '🛠️' }

export default function AdminDashboard() {
  const store = useStore()
  const [tab, setTab] = useState('Overview')
  const openTickets = store.tickets.filter((t) => t.status !== 'Resolved').length

  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>affinity<small>{store.landlord?.propertyName || 'House management'}</small></span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n} className={tab === n ? 'on' : ''} onClick={() => setTab(n)}>
              {n}
              {n === 'Maintenance' && openTickets > 0 && <span className="count">{openTickets}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <small>Signed in as {store.landlord?.name || 'landlord'}</small>
          <button className="btn btn-ghost-light" onClick={store.logout}>Sign out</button>
        </div>
      </aside>

      <main className="main">
        <header className="page-head">
          <h2>{tab}</h2>
        </header>
        {tab === 'Overview' && <Overview goTo={setTab} />}
        {tab === 'Rooms' && <Rooms />}
        {tab === 'Tenants' && <Tenants />}
        {tab === 'Billing' && <Billing />}
        {tab === 'Maintenance' && <Maintenance />}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------ Overview */

function Overview({ goTo }) {
  const { rooms, tenants, bills, tickets, setBillStatus } = useStore()
  const [proof, setProof] = useState(null)
  const live = rooms.filter((r) => !r.archived)
  const stats = live.map((r) => roomStats(r, tenants))
  const totalBeds = live.reduce((s, r) => s + r.capacity, 0)
  const filledBeds = stats.reduce((s, x) => s + x.filled, 0)
  const rate = totalBeds ? Math.round((filledBeds / totalBeds) * 100) : 0
  const revenue = bills.filter((b) => b.month === thisMonth() && b.status === 'Paid').reduce((s, b) => s + billTotal(b), 0)
  const pending = bills.filter((b) => b.status !== 'Paid').length
  const open = tickets.filter((t) => t.status !== 'Resolved')
  const review = bills.filter((b) => b.proof && b.status !== 'Paid')
  const nameOf = (id) => tenants.find((t) => t.id === id)?.name || 'Unknown'

  return (
    <>
      <div className="stats">
        <div className="stat">
          <small>Collected in {monthLabel(thisMonth())}</small>
          <strong>{money(revenue)}</strong>
        </div>
        <div className="stat">
          <small>Beds occupied</small>
          <strong>{rate}%</strong>
          <span>{filledBeds} of {totalBeds} beds</span>
        </div>
        <div className="stat">
          <small>Unpaid bills</small>
          <strong>{pending}</strong>
          <span>{bills.filter((b) => billStatus(b) === 'Overdue').length} overdue</span>
        </div>
        <div className="stat">
          <small>Open repair requests</small>
          <strong>{open.length}</strong>
        </div>
      </div>

      <h3 className="section-title">Rooms</h3>
      {live.length === 0 ? (
        <Empty>No rooms yet. Add your first room under Rooms.</Empty>
      ) : (
        <div className="plates">
          {live.map((r, i) => <RoomPlate key={r.id} room={r} stat={stats[i]} />)}
        </div>
      )}

      <div className="two-col">
        <section>
          <h3 className="section-title">Receipts to review</h3>
          {review.length === 0 ? (
            <Empty>No receipts waiting. Uploaded payment proofs show up here.</Empty>
          ) : (
            <ul className="rows">
              {review.map((b) => (
                <li key={b.id}>
                  <div>
                    <strong>{nameOf(b.tenantId)}</strong>
                    <small>{monthLabel(b.month)} · {money(billTotal(b))}</small>
                  </div>
                  <div className="row-actions">
                    <button className="btn btn-sm" onClick={() => setProof(b.proof)}>View receipt</button>
                    <button className="btn btn-sm btn-primary" onClick={() => setBillStatus(b.id, 'Paid')}>Mark as paid</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="section-title">Open repair requests</h3>
          {open.length === 0 ? (
            <Empty>Nothing to fix right now.</Empty>
          ) : (
            <ul className="rows">
              {open.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <div>
                    <strong>{t.category}</strong>
                    <small>{nameOf(t.tenantId)} · {t.description.slice(0, 50)}</small>
                  </div>
                  <Badge>{t.status}</Badge>
                </li>
              ))}
            </ul>
          )}
          {open.length > 0 && <button className="link" onClick={() => goTo('Maintenance')}>Open the repair board</button>}
        </section>
      </div>
      <FileView file={proof} title="Payment receipt" onClose={() => setProof(null)} />
    </>
  )
}

function RoomPlate({ room, stat, children }) {
  return (
    <article className={`plate plate-${stat.status.replace(' ', '-').toLowerCase()}`}>
      <header>
        <div>
          <small>Room</small>
          <h4>{room.number}</h4>
        </div>
        <Badge>{stat.status}</Badge>
      </header>
      <div className="pips">
        {stat.beds.map((b) => (
          <span
            key={b.label}
            className={`pip ${b.tenant ? 'pip-full' : ''} ${b.cleaning ? 'pip-clean' : ''}`}
            title={b.tenant ? `${b.label}: ${b.tenant.name}` : b.cleaning ? `${b.label}: cleaning` : `${b.label}: vacant`}
          >
            {b.label}
          </span>
        ))}
      </div>
      <p className="plate-meta">{stat.filled}/{room.capacity} beds · {money(room.rate)} per bed</p>
      {children}
    </article>
  )
}

/* --------------------------------------------------------------- Rooms */

function Rooms() {
  const store = useStore()
  const [editing, setEditing] = useState(null) // room | 'new'
  const [assigning, setAssigning] = useState(null)
  const [error, setError] = useState('')
  const rooms = store.rooms.filter((r) => !r.archived)
  const archived = store.rooms.filter((r) => r.archived)
  const archive = async (id) => {
    const result = await store.archiveRoom(id)
    setError(result.error || '')
  }

  return (
    <>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setEditing('new')}>Add room</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {rooms.length === 0 && <Empty>No rooms yet. Add one to start assigning beds.</Empty>}
      <div className="plates plates-wide">
        {rooms.map((room) => {
          const stat = roomStats(room, store.tenants)
          const freeBeds = stat.beds.filter((b) => !b.tenant && !b.cleaning)
          return (
            <RoomPlate key={room.id} room={room} stat={stat}>
              <ul className="beds">
                {stat.beds.map((b) => (
                  <li key={b.label}>
                    <span className="bed-name">Bed {b.label}</span>
                    {b.tenant ? (
                      <>
                        <span className="bed-who">{b.tenant.name}</span>
                        <button className="link" onClick={() => store.moveOut(b.tenant.id)}>Move out</button>
                      </>
                    ) : b.cleaning ? (
                      <>
                        <span className="bed-who muted">Cleaning</span>
                        <button className="link" onClick={() => store.clearCleaning(room.id, b.label)}>Mark ready</button>
                      </>
                    ) : (
                      <span className="bed-who muted">Vacant</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="plate-actions">
                <button
                  className="btn btn-sm btn-primary"
                  disabled={room.maintenance || freeBeds.length === 0}
                  onClick={() => setAssigning(room)}
                >
                  Assign tenant
                </button>
                <button className="btn btn-sm" onClick={() => setEditing(room)}>Edit</button>
                <button className="btn btn-sm" onClick={() => store.updateRoom(room.id, { maintenance: !room.maintenance })}>
                  {room.maintenance ? 'Reopen room' : 'Under maintenance'}
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => archive(room.id)}>Archive</button>
              </div>
            </RoomPlate>
          )
        })}
      </div>
      {archived.length > 0 && (
        <p className="muted">
          Archived: {archived.map((r) => (
            <button key={r.id} className="link" onClick={() => store.restoreRoom(r.id)}>
              Room {r.number} (restore)
            </button>
          ))}
        </p>
      )}
      {editing && <RoomForm room={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {assigning && <AssignModal room={assigning} onClose={() => setAssigning(null)} />}
    </>
  )
}

function RoomForm({ room, onClose }) {
  const store = useStore()
  const occupiedCount = room ? roomStats(room, store.tenants).filled : 0
  const [f, setF] = useState({
    number: room?.number || '', capacity: room?.capacity || 4, rate: room?.rate || 2500,
  })
  const [error, setError] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    const capacity = Number(f.capacity)
    const rate = Number(f.rate)
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 12) {
      return setError('A room must have between 1 and 12 beds.')
    }
    if (!Number.isFinite(rate) || rate < 0) return setError('Enter a valid non-negative rent amount.')
    if (capacity < Math.max(1, occupiedCount)) return setError(`Capacity can't be below the ${occupiedCount} beds already in use.`)
    if (store.rooms.some((r) => r.number === f.number.trim() && r.id !== room?.id && !r.archived)) {
      return setError('Another room already uses that number.')
    }
    const next = { number: f.number.trim(), capacity, rate }
    const result = room ? await store.updateRoom(room.id, next) : await store.addRoom(next)
    if (result.error) return setError(result.error)
    onClose()
  }

  return (
    <Modal title={room ? `Edit Room ${room.number}` : 'Add room'} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <Field label="Room number"><input value={f.number} onChange={set('number')} required /></Field>
        <Field label="Number of beds"><input type="number" min="1" max="12" value={f.capacity} onChange={set('capacity')} required /></Field>
        <Field label="Monthly rent per bed (₱)"><input type="number" min="0" value={f.rate} onChange={set('rate')} required /></Field>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary">Save room</button>
      </form>
    </Modal>
  )
}

function AssignModal({ room, onClose }) {
  const store = useStore()
  const stat = roomStats(room, store.tenants)
  const freeBeds = stat.beds.filter((b) => !b.tenant && !b.cleaning)
  const waiting = store.tenants.filter((t) => t.active && !t.roomId)
  const [tenantId, setTenantId] = useState(waiting[0]?.id || '')
  const [bed, setBed] = useState(freeBeds[0]?.label || '')
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const result = await store.assignTenant(tenantId, room.id, bed)
    if (result.error) {
      setError(result.error)
      return
    }
    onClose()
  }

  return (
    <Modal title={`Assign a tenant to Room ${room.number}`} onClose={onClose}>
      {waiting.length === 0 ? (
        <Empty>Every active tenant already has a bed. Add a new boarder under Tenants first.</Empty>
      ) : (
        <form className="stack" onSubmit={submit}>
          <Field label="Tenant">
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              {waiting.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Bed">
            <select value={bed} onChange={(e) => setBed(e.target.value)}>
              {freeBeds.map((b) => <option key={b.label} value={b.label}>Bed {b.label}</option>)}
            </select>
          </Field>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary">Assign to bed</button>
        </form>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------- Tenants */

function Tenants() {
  const store = useStore()
  const [form, setForm] = useState(null) // 'new' | tenant
  const [openId, setOpenId] = useState(null)
  const [showInactive, setShowInactive] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [importError, setImportError] = useState(false)
  const list = store.tenants.filter((t) => showInactive || t.active)
  const roomOf = (t) => store.rooms.find((r) => r.id === t.roomId)

  return (
    <>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setForm('new')}>Add boarder</button>
        <button className="btn" onClick={() => { setImportMessage(''); setImportError(false); setImporting(true) }}>Import from Excel</button>
        <label className="check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show moved-out boarders
        </label>
      </div>
      {importMessage && <p className={importError ? 'error' : 'success'} role={importError ? 'alert' : 'status'}>{importMessage}</p>}
      {list.length === 0 ? (
        <Empty>No boarders yet. Add a boarder to create their profile.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Room / bed</th><th>Contact</th><th>Lease ends</th><th>Status</th></tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className="clickable" tabIndex={0} onClick={() => setOpenId(t.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(t.id)}>
                  <td><strong>{t.name}</strong></td>
                  <td>{roomOf(t) ? `${roomOf(t).number} · Bed ${t.bed}` : <span className="muted">Not assigned</span>}</td>
                  <td>{t.phone}</td>
                  <td>{fmtDate(t.leaseEnd)}</td>
                  <td><Badge tone={t.active ? 'green' : 'grey'}>{t.active ? 'Active' : 'Moved out'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && <TenantForm tenant={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {importing && (
        <TenantExcelImport
          tenants={store.tenants}
          onClose={() => setImporting(false)}
          onImport={async (records) => {
            const result = await store.importTenants(records)
            if (result.error) {
              setImportError(true)
              setImportMessage(result.error)
              return
            }
            setImportMessage(`Imported ${records.length} boarder${records.length === 1 ? '' : 's'} successfully.`)
            setImporting(false)
          }}
        />
      )}
      {openId && (
        <TenantDetail
          id={openId}
          onClose={() => setOpenId(null)}
          onEdit={(t) => { setOpenId(null); setForm(t) }}
        />
      )}
    </>
  )
}

function TenantForm({ tenant, onClose }) {
  const store = useStore()
  const [f, setF] = useState({
    name: tenant?.name || '', phone: tenant?.phone || '', email: tenant?.email || '',
    emergency: tenant?.emergency || '', emergencyPhone: tenant?.emergencyPhone || '',
    moveIn: tenant?.moveIn || todayStr(), leaseEnd: tenant?.leaseEnd || '',
  })
  const [error, setError] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    const dup = store.tenants.some((t) => t.email.toLowerCase() === f.email.trim().toLowerCase() && t.id !== tenant?.id)
    if (dup) return setError('Another boarder already uses that email.')
    if (f.leaseEnd && f.leaseEnd < f.moveIn) return setError('Lease end date must be on or after the move-in date.')
    const next = Object.fromEntries(Object.entries(f).map(([key, value]) => [key, value.trim()]))
    const result = tenant ? await store.updateTenant(tenant.id, next) : await store.addTenant(next)
    if (result.error) return setError(result.error)
    onClose()
  }

  return (
    <Modal title={tenant ? 'Edit boarder' : 'Add boarder'} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <Field label="Full name"><input value={f.name} onChange={set('name')} required /></Field>
        <div className="grid-2">
          <Field label="Mobile number"><input value={f.phone} onChange={set('phone')} required /></Field>
          <Field label="Email" hint="Used for their sign-in link"><input type="email" value={f.email} onChange={set('email')} required /></Field>
        </div>
        <div className="grid-2">
          <Field label="Emergency contact name"><input value={f.emergency} onChange={set('emergency')} required /></Field>
          <Field label="Emergency contact number"><input value={f.emergencyPhone} onChange={set('emergencyPhone')} required /></Field>
        </div>
        <div className="grid-2">
          <Field label="Move-in date"><input type="date" value={f.moveIn} onChange={set('moveIn')} required /></Field>
          <Field label="Lease ends"><input type="date" value={f.leaseEnd} onChange={set('leaseEnd')} /></Field>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary">Save boarder</button>
      </form>
    </Modal>
  )
}

function TenantDetail({ id, onClose, onEdit }) {
  const store = useStore()
  const t = store.tenants.find((x) => x.id === id)
  const [view, setView] = useState(null)
  if (!t) return null
  const room = store.rooms.find((r) => r.id === t.roomId)
  const owed = store.bills.filter((b) => b.tenantId === t.id && b.status !== 'Paid').reduce((s, b) => s + billTotal(b), 0)

  return (
    <Modal title={t.name} onClose={onClose} wide>
      <dl className="facts">
        <div><dt>Room</dt><dd>{room ? `${room.number}, Bed ${t.bed}` : 'Not assigned'}</dd></div>
        <div><dt>Mobile</dt><dd>{t.phone}</dd></div>
        <div><dt>Email</dt><dd>{t.email}</dd></div>
        <div><dt>Emergency contact</dt><dd>{t.emergency} · {t.emergencyPhone}</dd></div>
        <div><dt>Moved in</dt><dd>{fmtDate(t.moveIn)}</dd></div>
        <div><dt>Lease ends</dt><dd>{fmtDate(t.leaseEnd)}</dd></div>
        <div><dt>Unpaid balance</dt><dd>{money(owed)}</dd></div>
        <div><dt>Status</dt><dd><Badge tone={t.active ? 'green' : 'grey'}>{t.active ? 'Active' : 'Moved out'}</Badge></dd></div>
      </dl>

      <h4 className="sub">IDs and signed contracts</h4>
      {t.docs.length === 0 ? (
        <Empty>No documents uploaded yet.</Empty>
      ) : (
        <ul className="rows">
          {t.docs.map((d) => (
            <li key={d.id}>
              <div>
                <strong>{d.name}</strong>
                <small>Uploaded {fmtDate(d.uploadedAt)}</small>
              </div>
              <div className="row-actions">
                <button className="btn btn-sm" onClick={() => setView(d)}>View</button>
                <button className="btn btn-sm btn-danger" onClick={() => store.removeDoc(t.id, d.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="toolbar">
        <UploadButton label="Upload ID or contract" onFile={(f) => store.addDoc(t.id, f)} />
        <button className="btn" onClick={() => onEdit(t)}>Edit details</button>
        {t.active ? (
          <button className="btn btn-danger" onClick={() => store.moveOut(t.id)}>Mark as moved out</button>
        ) : (
          <button className="btn" onClick={() => store.updateTenant(t.id, { active: true })}>Move back in</button>
        )}
      </div>
      <FileView file={view} onClose={() => setView(null)} />
    </Modal>
  )
}

/* ------------------------------------------------------------- Billing */

function Billing() {
  const store = useStore()
  const { rooms, tenants, bills } = store
  const liveRooms = rooms.filter((r) => !r.archived)
  const [f, setF] = useState({ roomId: liveRooms[0]?.id || '', month: thisMonth(), power: '', water: '150' })
  const [msg, setMsg] = useState(null)
  const [filter, setFilter] = useState('All')
  const [proof, setProof] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const nameOf = (id) => tenants.find((t) => t.id === id)?.name || 'Unknown'

  const room = rooms.find((r) => r.id === f.roomId)
  const count = room ? roomStats(room, tenants).filled : 0
  const preview = room && count ? room.rate + Number(f.power || 0) / count + Number(f.water || 0) : 0

  const generate = async (e) => {
    e.preventDefault()
    const res = await store.generateBills({ ...f })
    setMsg(
      res.error
        ? { error: true, text: res.error }
        : { text: `Created ${res.created} bill${res.created > 1 ? 's' : ''} (${money(res.perHead)} electricity each).${res.skipped ? ` ${res.skipped} already existed and were skipped.` : ''}` },
    )
  }

  const balances = tenants
    .filter((t) => t.active || bills.some((b) => b.tenantId === t.id && b.status !== 'Paid'))
    .map((t) => {
      const owed = bills.filter((b) => b.tenantId === t.id && b.status !== 'Paid')
      return { t, total: owed.reduce((s, b) => s + billTotal(b), 0), overdue: owed.filter((b) => billStatus(b) === 'Overdue').length }
    })
    .filter((x) => x.total > 0)

  const shown = [...bills]
    .filter((b) => filter === 'All' || billStatus(b) === filter)
    .sort((a, b) => b.month.localeCompare(a.month))

  return (
    <>
      <section className="panel">
        <h3 className="section-title">Generate a monthly bill</h3>
        <form className="bill-form" onSubmit={generate}>
          <Field label="Room">
            <select value={f.roomId} onChange={set('roomId')} required>
              {liveRooms.map((r) => <option key={r.id} value={r.id}>Room {r.number}</option>)}
            </select>
          </Field>
          <Field label="Month"><input type="month" value={f.month} onChange={set('month')} required /></Field>
          <Field label="Room electricity total (₱)"><input type="number" min="0" step="0.01" value={f.power} onChange={set('power')} required /></Field>
          <Field label="Water per person (₱)"><input type="number" min="0" step="0.01" value={f.water} onChange={set('water')} required /></Field>
          <button className="btn btn-primary" disabled={!room}>Issue invoices</button>
        </form>
        {preview > 0 && (
          <p className="muted">
            {count} tenant{count > 1 ? 's' : ''} in Room {room.number}. Each pays about <strong>{money(preview)}</strong> (rent {money(room.rate)} + electricity split + water).
          </p>
        )}
        {msg && <p className={msg.error ? 'error' : 'success'} role={msg.error ? 'alert' : 'status'}>{msg.text}</p>}
      </section>

      <h3 className="section-title">Balances owed</h3>
      {balances.length === 0 ? (
        <Empty>Everyone is paid up.</Empty>
      ) : (
        <ul className="rows">
          {balances.map(({ t, total, overdue }) => (
            <li key={t.id}>
              <div>
                <strong>{t.name}</strong>
                {overdue > 0 && <small className="error">{overdue} overdue bill{overdue > 1 ? 's' : ''}</small>}
              </div>
              <strong>{money(total)}</strong>
            </li>
          ))}
        </ul>
      )}

      <div className="toolbar between">
        <h3 className="section-title">All bills</h3>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status">
          {['All', 'Pending', 'Paid', 'Overdue'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {shown.length === 0 ? (
        <Empty>No bills match. Issue invoices above to create some.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Tenant</th><th>Month</th><th>Rent</th><th>Power</th><th>Water</th><th>Total</th><th>Receipt</th><th>Status</th></tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id}>
                  <td><strong>{nameOf(b.tenantId)}</strong></td>
                  <td>{monthLabel(b.month)}</td>
                  <td>{money(b.rent)}</td>
                  <td>{money(b.power)}</td>
                  <td>{money(b.water)}</td>
                  <td><strong>{money(billTotal(b))}</strong></td>
                  <td>
                    {b.proof ? (
                      <button className="link" onClick={() => setProof(b.proof)}>View</button>
                    ) : (
                      <UploadButton label="Attach" className="link" onFile={(file) => store.attachProof(b.id, file)} />
                    )}
                  </td>
                  <td>
                    <select
                      className={`status-select s-${billStatus(b).toLowerCase()}`}
                      value={billStatus(b)}
                      onChange={(e) => store.setBillStatus(b.id, e.target.value)}
                      aria-label="Payment status"
                    >
                      {['Pending', 'Paid', 'Overdue'].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <FileView file={proof} title="Payment receipt" onClose={() => setProof(null)} />
    </>
  )
}

/* --------------------------------------------------------- Maintenance */

function Maintenance() {
  const { tickets, tenants, rooms, setTicketStatus } = useStore()
  const [photo, setPhoto] = useState(null)
  const columns = ['Open', 'In Progress', 'Resolved']

  return (
    <>
      {tickets.length === 0 && <Empty>No repair requests yet. Boarders can send them from their portal.</Empty>}
      <div className="board">
        {columns.map((col) => (
          <section key={col}>
            <h3 className="section-title">{col} <span className="muted">({tickets.filter((t) => t.status === col).length})</span></h3>
            {tickets.filter((t) => t.status === col).map((t) => {
              const tenant = tenants.find((x) => x.id === t.tenantId)
              const room = rooms.find((r) => r.id === tenant?.roomId)
              return (
                <article key={t.id} className="ticket">
                  <header>
                    <strong>{CATEGORY_ICON[t.category] || '🛠️'} {t.category}</strong>
                    <small>{fmtDate(t.createdAt)}</small>
                  </header>
                  <p>{t.description}</p>
                  <small className="muted">{tenant?.name || 'Unknown'}{room ? ` · Room ${room.number}` : ''}</small>
                  <div className="row-actions">
                    {t.photo && <button className="btn btn-sm" onClick={() => setPhoto(t.photo)}>View photo</button>}
                    <select value={t.status} onChange={(e) => setTicketStatus(t.id, e.target.value)} aria-label="Ticket status">
                      {columns.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </article>
              )
            })}
          </section>
        ))}
      </div>
      <FileView file={photo} title="Reported issue" onClose={() => setPhoto(null)} />
    </>
  )
}