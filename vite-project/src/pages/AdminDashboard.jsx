import { useState } from 'react'
import {
  useStore, roomStats, money, fmtDate, monthLabel, billTotal, billStatus, thisMonth, todayStr,
} from '../store'
import { Badge, Modal, Field, UploadButton, FileView, Empty } from '../ui'
import TenantExcelImport from './TenantExcelImport'
import { LandlordProperties } from './PropertyManagement'
import { AccountSettings, AuditReports, Transactions } from './ManagementPages'
import { LandlordContracts, LandlordExtensions } from './ContractManagement'

const NAV = [
  ['Overview', '⌂'], ['Listings', '▤'], ['Rooms', '▦'], ['Tenants', '♙'],
  ['Contracts', '▧'], ['Extension Requests', '↗'],
  ['Transactions', '₱'], ['Billing', '◷'], ['Audit Reports', '≡'], ['Maintenance', '⚒'], ['Settings', '⚙'],
]
const CATEGORY_ICON = {
  Plumbing: '🚰', Electrical: '💡', 'Wi-Fi / Internet': '📶', 'Air conditioning': '❄️',
  Furniture: '🪑', 'Structural damage': '🏚️', Cleanliness: '🧹',
  'Safety concern': '⚠️', Other: '🛠️',
}
const PAGE_DESCRIPTIONS = {
  Overview: 'Your boarding house at a glance.',
  Listings: 'Manage property details, publishing, and tenant inquiries.',
  Rooms: 'Manage room availability and resident assignments.',
  Tenants: 'Resident records, contacts, and rental details.',
  Contracts: 'Prepare rental agreements and review tenant acceptance.',
  'Extension Requests': 'Review and approve additional rental days.',
  Transactions: 'Review rent payments and submitted proofs.',
  Billing: 'Create monthly bills and review outstanding balances.',
  'Audit Reports': 'Track and export recent workspace activity.',
  Maintenance: 'Respond to tenant reports and keep repairs moving.',
  Settings: 'Manage your landlord account and workspace information.',
}

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
          {NAV.map(([name, icon]) => (
            <button key={name} className={tab === name ? 'on' : ''} aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name)}>
              <span className="nav-icon" aria-hidden="true">{icon}</span>
              <span>{name}</span>
              {name === 'Maintenance' && openTickets > 0 && <span className="count">{openTickets}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-user">
            <span className="avatar">{(store.landlord?.name || 'L').slice(0, 1).toUpperCase()}</span>
            <span><strong>{store.landlord?.name || 'Landlord'}</strong><small>Property owner</small></span>
          </div>
          <button className="btn btn-ghost-light" onClick={store.logout}><span aria-hidden="true">↗</span> Sign out</button>
        </div>
      </aside>

      <main className="main">
        <header className="page-head">
          <div><span className="eyebrow">AFFINITY · LANDLORD WORKSPACE</span><h2>{tab === 'Overview' ? `Welcome back, ${(store.landlord?.name || 'Landlord').split(' ')[0]}` : tab}</h2><p>{PAGE_DESCRIPTIONS[tab]}</p></div>
          <time>{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</time>
        </header>
        {tab === 'Overview' && <Overview goTo={setTab} />}
        {tab === 'Listings' && <LandlordProperties />}
        {tab === 'Rooms' && <Rooms />}
        {tab === 'Tenants' && <Tenants />}
        {tab === 'Contracts' && <LandlordContracts />}
        {tab === 'Extension Requests' && <LandlordExtensions />}
        {tab === 'Transactions' && <Transactions />}
        {tab === 'Billing' && <Billing />}
        {tab === 'Audit Reports' && <AuditReports />}
        {tab === 'Maintenance' && <Maintenance />}
        {tab === 'Settings' && <AccountSettings />}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------ Overview */

function Overview({ goTo }) {
  const { rooms, tenants, bills, tickets, properties = [], setBillStatus } = useStore()
  const [proof, setProof] = useState(null)
  const live = rooms.filter((r) => !r.archived)
  const stats = live.map((r) => roomStats(r, tenants))
  const totalBeds = live.reduce((s, r) => s + r.capacity, 0)
  const filledBeds = stats.reduce((s, x) => s + x.filled, 0)
  const availableBeds = stats.reduce((s, x) => s + x.beds.filter((bed) => !bed.tenant && !bed.cleaning).length, 0)
  const rate = totalBeds ? Math.round((filledBeds / totalBeds) * 100) : 0
  const revenue = bills.filter((b) => b.month === thisMonth() && b.status === 'Paid').reduce((s, b) => s + billTotal(b), 0)
  const pending = bills.filter((b) => b.status !== 'Paid').length
  const open = tickets.filter((t) => t.status !== 'Resolved')
  const recentBills = [...bills].sort((a, b) => String(b.submittedAt || b.paidAt || b.createdAt || b.month).localeCompare(
    String(a.submittedAt || a.paidAt || a.createdAt || a.month),
  )).slice(0, 5)
  const review = bills.filter((b) => b.proof && b.status !== 'Paid')
  const nameOf = (id) => tenants.find((t) => t.id === id)?.name || 'Unknown'

  return (
    <>
      <div className="stats">
        <StatCard label="Property listings" value={properties.length} detail={`${properties.filter((property) => property.published).length} published`} icon="⌂" />
        <StatCard label="Rooms" value={live.length} detail={`${availableBeds} beds available`} icon="▦" />
        <StatCard label="Occupied beds" value={`${rate}%`} detail={`${filledBeds} of ${totalBeds} beds`} icon="♙" />
        <StatCard label="Active tenants" value={tenants.filter((tenant) => tenant.active).length} detail="Current residents" icon="♧" />
        <StatCard label={`Collected · ${monthLabel(thisMonth())}`} value={money(revenue)} detail="Confirmed this month" icon="₱" />
        <StatCard label="Pending payments" value={pending} detail={`${bills.filter((b) => billStatus(b) === 'Overdue').length} overdue`} icon="◷" />
        <StatCard label="Maintenance requests" value={open.length} detail="Need attention" icon="⚒" />
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
      <section className="management-section">
        <div className="section-heading-row"><div><h2>Recent transactions</h2><p>Latest tenant payments and submissions.</p></div><button className="link" onClick={() => goTo('Transactions')}>View all transactions →</button></div>
        {recentBills.length === 0 ? <Empty>No payment activity to show yet.</Empty> : (
          <div className="table-wrap">
            <table><thead><tr><th>Tenant</th><th>Billing period</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>{recentBills.map((bill) => (
                <tr key={bill.id}><td><strong>{nameOf(bill.tenantId)}</strong></td><td>{monthLabel(bill.month)}</td><td>{money(billTotal(bill))}</td><td>{fmtDate(bill.paidAt || bill.submittedAt || bill.createdAt)}</td><td><Badge>{billStatus(bill)}</Badge></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <FileView file={proof} title="Payment receipt" onClose={() => setProof(null)} />
    </>
  )
}

function StatCard({ label, value, detail, icon }) {
  return <article className="stat"><span className="stat-icon" aria-hidden="true">{icon}</span><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>
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
  const paymentOf = (tenant) => {
    const bills = store.bills.filter((bill) => bill.tenantId === tenant.id)
    if (!bills.length) return 'No bills'
    if (bills.some((bill) => billStatus(bill) === 'Overdue')) return 'Overdue'
    if (bills.some((bill) => bill.status !== 'Paid')) return 'Pending'
    return 'Paid'
  }

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
              <tr><th>Name</th><th>Room / bed</th><th>Move-in</th><th>Monthly rent</th><th>Payment</th><th>Contact</th><th>Lease ends</th><th>Status</th></tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className="clickable" tabIndex={0} onClick={() => setOpenId(t.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(t.id)}>
                  <td><strong>{t.name}</strong></td>
                  <td>{roomOf(t) ? `${roomOf(t).number} · Bed ${t.bed}` : <span className="muted">Not assigned</span>}</td>
                  <td>{fmtDate(t.moveIn)}</td>
                  <td>{roomOf(t) ? money(roomOf(t).rate) : '—'}</td>
                  <td><Badge>{paymentOf(t)}</Badge></td>
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
  const tenantBills = store.bills.filter((b) => b.tenantId === t.id).sort((a, b) => b.month.localeCompare(a.month))
  const owed = tenantBills.filter((b) => b.status !== 'Paid').reduce((s, b) => s + billTotal(b), 0)

  return (
    <Modal title={t.name} onClose={onClose} wide>
      <dl className="facts">
        <div><dt>Room</dt><dd>{room ? `${room.number}, Bed ${t.bed}` : 'Not assigned'}</dd></div>
        <div><dt>Mobile</dt><dd>{t.phone}</dd></div>
        <div><dt>Email</dt><dd>{t.email}</dd></div>
        <div><dt>Emergency contact</dt><dd>{t.emergency} · {t.emergencyPhone}</dd></div>
        <div><dt>Moved in</dt><dd>{fmtDate(t.moveIn)}</dd></div>
        <div><dt>Monthly rent</dt><dd>{room ? money(room.rate) : '—'}</dd></div>
        <div><dt>Lease ends</dt><dd>{fmtDate(t.leaseEnd)}</dd></div>
        <div><dt>Unpaid balance</dt><dd>{money(owed)}</dd></div>
        <div><dt>Status</dt><dd><Badge tone={t.active ? 'green' : 'grey'}>{t.active ? 'Active' : 'Moved out'}</Badge></dd></div>
      </dl>

      <h4 className="sub">Payment history</h4>
      {tenantBills.length === 0 ? <Empty>No payment history yet.</Empty> : (
        <div className="table-wrap">
          <table><thead><tr><th>Period</th><th>Amount</th><th>Payment date</th><th>Status</th></tr></thead>
            <tbody>{tenantBills.map((bill) => <tr key={bill.id}><td>{monthLabel(bill.month)}</td><td>{money(billTotal(bill))}</td><td>{fmtDate(bill.paidAt || bill.submittedAt || bill.createdAt)}</td><td><Badge>{billStatus(bill)}</Badge></td></tr>)}</tbody>
          </table>
        </div>
      )}

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
  const { tickets, tenants, rooms, properties = [] } = useStore()
  const [photo, setPhoto] = useState(null)
  const columns = ['Pending', 'In Progress', 'Resolved']
  const statusOf = (ticket) => ticket.status === 'Open' ? 'Pending' : ticket.status

  return (
    <>
      {tickets.length === 0 && <Empty>No repair requests yet. Boarders can send them from their portal.</Empty>}
      <div className="board">
        {columns.map((col) => (
          <section key={col}>
            <h3 className="section-title">{col} <span className="muted">({tickets.filter((t) => statusOf(t) === col).length})</span></h3>
            {tickets.filter((t) => statusOf(t) === col).map((t) => {
              const tenant = tenants.find((x) => x.id === t.tenantId)
              const roomId = Object.hasOwn(t, 'roomId') ? t.roomId : tenant?.roomId
              const room = rooms.find((r) => r.id === roomId)
              const property = properties.find((item) => item.id === t.propertyId) ||
                (!Object.hasOwn(t, 'propertyId') ? properties.find((item) =>
                  item.id === tenant?.propertyId || (room && item.roomIds?.includes(room.id))) : null)
              return <MaintenanceTicket key={t.id} ticket={t} tenant={tenant} room={room} property={property} columns={columns} onPhoto={setPhoto} />
            })}
          </section>
        ))}
      </div>
      <FileView file={photo} title="Reported issue" onClose={() => setPhoto(null)} />
    </>
  )
}

function MaintenanceTicket({ ticket, tenant, room, property, columns, onPhoto }) {
  const { setTicketStatus, respondToTicket } = useStore()
  const [response, setResponse] = useState(ticket.response || '')
  const [message, setMessage] = useState('')
  const status = ticket.status === 'Open' ? 'Pending' : ticket.status
  const saveResponse = async (event) => {
    event.preventDefault()
    const result = await respondToTicket(ticket.id, response)
    setMessage(result.error || 'Response saved.')
  }

  return (
    <article className="ticket">
      <header><strong>{CATEGORY_ICON[ticket.category] || '🛠️'} {ticket.category}</strong><small>{fmtDate(ticket.createdAt)}</small></header>
      <p>{ticket.description}</p>
      <div className="ticket-report-details">
        <p><strong>Tenant:</strong> {tenant?.name || 'Unknown tenant'}</p>
        {(tenant?.email || tenant?.phone) && <small className="muted">{[tenant.email, tenant.phone].filter(Boolean).join(' · ')}</small>}
        <p><strong>Property:</strong> {property?.name || 'General / No assigned property'}</p>
        {ticket.propertyLocation && <p><strong>Property or location details:</strong> {ticket.propertyLocation}</p>}
        {(ticket.specificLocation || room) && <p><strong>Room or specific location:</strong> {ticket.specificLocation || `Room ${room.number}`}</p>}
      </div>
      <div className="row-actions">
        {ticket.photo && <button className="btn btn-sm" onClick={() => onPhoto(ticket.photo)}>View photo</button>}
        <select value={status} onChange={(event) => setTicketStatus(ticket.id, event.target.value)} aria-label="Ticket status">
          {columns.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <form className="stack ticket-response" onSubmit={saveResponse}>
        <Field label="Response to tenant"><textarea rows="2" value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Share an update or maintenance note." /></Field>
        <button className="btn btn-sm">Save response</button>
        {message && <small role="status">{message}</small>}
      </form>
    </article>
  )
}