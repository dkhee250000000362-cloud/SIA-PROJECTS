import { useState } from 'react'
import { billStatus, billTotal, fmtDate, money, monthLabel, useStore } from '../store'
import { Badge, Empty, Field, FileView, UploadButton } from '../ui'
import { TenantBookings, TenantPropertyBrowser } from './PropertyManagement'
import { TenantContracts } from './ContractManagement'

const TENANT_NAV = [
  ['Home', '⌂'], ['Browse Boarding Houses', '⌕'], ['My Booking', '▤'],
  ['My Room', '▦'], ['Payments', '₱'], ['Transactions', '◷'],
  ['Maintenance', '⚒'], ['Contracts', '▧'], ['Profile', '♙'],
]
const MAINTENANCE_CATEGORIES = [
  'Plumbing', 'Electrical', 'Wi-Fi / Internet', 'Air conditioning', 'Furniture',
  'Structural damage', 'Cleanliness', 'Safety concern', 'Other',
]

function tenantDisplayName(tenant, session) {
  const name = [session?.name, tenant?.name].find((candidate) =>
    typeof candidate === 'string' && candidate.trim() && !candidate.includes('@'))
  if (name) return name.trim()

  const email = tenant?.email || session?.email || ''
  const username = email.split('@')[0].replace(/[._-]+/g, ' ').trim()
  return username ? username.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Tenant'
}

export default function UserDashboard() {
  const store = useStore()
  const [tab, setTab] = useState('Home')
  const tenant = store.tenants.find((item) => item.id === store.session?.tenantId)

  if (!tenant) {
    return (
      <main className="crash-screen">
        <section className="crash-card" role="alert">
          <h1>Tenant profile unavailable</h1>
          <p>We couldn't find your boarder profile. Please contact your landlord.</p>
          <button className="btn" onClick={store.logout}>Back to sign in</button>
        </section>
      </main>
    )
  }

  const room = store.rooms.find((item) => item.id === tenant.roomId)
  const bills = store.bills.filter((bill) => bill.tenantId === tenant.id)
  const owed = bills.filter((bill) => bill.status !== 'Paid').reduce((sum, bill) => sum + billTotal(bill), 0)
  const upcoming = bills.filter((bill) => bill.status !== 'Paid').sort((a, b) => a.due.localeCompare(b.due))[0]
  const property = (store.properties || []).find((item) =>
    item.id === tenant.propertyId || (room && item.roomIds?.includes(room.id)))
  const tickets = store.tickets.filter((ticket) => ticket.tenantId === tenant.id)
  const displayName = tenantDisplayName(tenant, store.session)
  const pageTitles = {
    Home: `Welcome home, ${displayName}!`,
    'Browse Boarding Houses': 'Find a place to call home',
    'My Booking': 'My booking inquiries',
    'My Room': 'Your room and rental details',
    Payments: 'Payments and billing',
    Transactions: 'Your transaction history',
    Maintenance: 'Maintenance and damage reports',
    Contracts: 'Your rental contracts',
    Profile: 'Your profile',
  }

  return (
    <div className="tenant-shell">
      <aside className="tenant-side">
        <a className="tenant-brand" href="#home" onClick={(event) => { event.preventDefault(); setTab('Home') }}>
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>affinity<small>BOARDER PORTAL</small></span>
        </a>
        <p className="tenant-nav-label">YOUR HOME</p>
        <nav>
          {TENANT_NAV.map(([name, icon]) => (
            <button key={name} className={tab === name ? 'on' : ''} aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name)}>
              <span className="nav-icon" aria-hidden="true">{icon}</span><span>{name}</span>
              {name === 'Maintenance' && tickets.some((ticket) => ticket.status !== 'Resolved') && <i className="nav-dot" aria-label="Open maintenance requests" />}
            </button>
          ))}
        </nav>
        <div className="tenant-side-user">
          <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span>
          <span><strong>{displayName}</strong><small>Tenant account</small></span>
        </div>
        <button className="btn btn-ghost-light" onClick={store.logout}><span aria-hidden="true">↗</span> Sign out</button>
      </aside>

      <main className="tenant-main">
        <header className="tenant-topbar">
          <div><span className="eyebrow">AFFINITY · TENANT PORTAL</span><h1>{pageTitles[tab]}</h1></div>
          <span className="tenant-greeting"><span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span><strong>{displayName}</strong></span>
        </header>

        {tab === 'Home' && <TenantHome tenant={tenant} room={room} property={property} bills={bills} tickets={tickets} owed={owed} upcoming={upcoming} goTo={setTab} />}
        {tab === 'Browse Boarding Houses' && <TenantPropertyBrowser />}
        {tab === 'My Booking' && <TenantBookings />}
        {tab === 'My Room' && <MyRoom tenant={tenant} room={room} property={property} bills={bills} />}
        {tab === 'Payments' && <Payments bills={bills} />}
        {tab === 'Transactions' && <TenantTransactions bills={bills} room={room} property={property} />}
        {tab === 'Maintenance' && <MaintenancePage tenant={tenant} property={property} tickets={tickets} />}
        {tab === 'Contracts' && <TenantContracts />}
        {tab === 'Profile' && <TenantProfile tenant={tenant} displayName={displayName} />}
      </main>
    </div>
  )
}

function TenantHome({ tenant, room, property, bills, tickets, owed, upcoming, goTo }) {
  const recent = [...bills].sort((a, b) => String(b.submittedAt || b.paidAt || b.createdAt || b.month).localeCompare(
    String(a.submittedAt || a.paidAt || a.createdAt || a.month),
  )).slice(0, 4)
  return (
    <>
      <section className="tenant-hero">
        <div><span className="eyebrow">YOUR STAY AT AFFINITY</span><h2>{property?.name || 'Your boarding house'}</h2><p>{property?.address ? `${property.address}, ${property.city}` : 'Your home, payments, and requests — all in one place.'}</p></div>
        <button className="btn btn-primary" onClick={() => goTo('Browse Boarding Houses')}>Explore homes <span aria-hidden="true">→</span></button>
      </section>
      <div className="tenant-summary">
        <SummaryCard label="Monthly rent" value={money(room?.rate || 0)} icon="₱" />
        <SummaryCard label="Next payment due" value={upcoming ? fmtDate(upcoming.due) : 'All paid'} detail={upcoming ? monthLabel(upcoming.month) : 'You’re all caught up'} icon="◷" />
        <SummaryCard label="Outstanding balance" value={money(owed)} detail={owed ? 'Payment proof required' : 'No balance due'} icon="↗" />
        <SummaryCard label="Room" value={room ? room.number : 'Unassigned'} detail={room ? `Bed ${tenant.bed}` : 'Ask your landlord'} icon="▦" />
      </div>
      <div className="tenant-content-grid">
        <section className="panel tenant-panel">
          <div className="section-heading-row"><div><h2>Recent transactions</h2><p>Your latest rent activity.</p></div><button className="link" onClick={() => goTo('Transactions')}>View all →</button></div>
          {recent.length === 0 ? <Empty>No transactions yet. Your landlord will issue a bill each month.</Empty> : (
            <div className="compact-list">{recent.map((bill) => <div className="compact-row" key={bill.id}><span className="mini-icon">₱</span><span><strong>{monthLabel(bill.month)}</strong><small>Due {fmtDate(bill.due)}</small></span><strong>{money(billTotal(bill))}</strong><Badge>{billStatus(bill)}</Badge></div>)}</div>
          )}
        </section>
        <section className="panel tenant-panel">
          <div className="section-heading-row"><div><h2>Maintenance requests</h2><p>Updates from your landlord.</p></div><button className="link" onClick={() => goTo('Maintenance')}>View all →</button></div>
          {tickets.length === 0 ? <Empty>No maintenance requests yet.</Empty> : (
            <div className="compact-list">{tickets.slice(0, 4).map((ticket) => <div className="compact-row" key={ticket.id}><span className="mini-icon">⚒</span><span><strong>{ticket.category}</strong><small>{ticket.description}</small></span><Badge>{ticket.status === 'Open' ? 'Pending' : ticket.status}</Badge></div>)}</div>
          )}
        </section>
      </div>
    </>
  )
}

function SummaryCard({ label, value, detail, icon }) {
  return <article className="tenant-summary-card"><span className="tenant-stat-icon">{icon}</span><small>{label}</small><strong>{value}</strong>{detail && <span>{detail}</span>}</article>
}

function MyRoom({ tenant, room, property, bills }) {
  if (!room) return <Empty>You don't have a room assigned yet. Contact your landlord or browse available boarding houses.</Empty>
  const unpaid = bills.filter((bill) => bill.status !== 'Paid')
  return (
    <div className="room-detail-grid">
      <section className="panel tenant-panel">
        {property?.images?.[0] && <img className="room-detail-image" src={property.images[0].dataUrl} alt={property.name} />}
        <span className="eyebrow">CURRENT RESIDENCE</span><h2>{property?.name || 'Boarding house'}</h2>
        <p>{property ? `${property.address}, ${property.city}` : 'Your current rental'}</p>
        <dl className="facts">
          <div><dt>Room</dt><dd>{room.number} · Bed {tenant.bed}</dd></div>
          <div><dt>Monthly rent</dt><dd>{money(room.rate)}</dd></div>
          <div><dt>Move-in date</dt><dd>{fmtDate(tenant.moveIn)}</dd></div>
          <div><dt>Lease ends</dt><dd>{fmtDate(tenant.leaseEnd)}</dd></div>
          <div><dt>Room status</dt><dd><Badge>Occupied</Badge></dd></div>
        </dl>
      </section>
      <section className="panel tenant-panel"><h2>Current balance</h2><p>Unpaid bills for your room.</p>
        {unpaid.length === 0 ? <Empty>No outstanding bills.</Empty> : unpaid.map((bill) => <div className="balance-line" key={bill.id}><span>{monthLabel(bill.month)} <small>Due {fmtDate(bill.due)}</small></span><strong>{money(billTotal(bill))}</strong></div>)}
      </section>
    </div>
  )
}

function Payments({ bills }) {
  if (bills.length === 0) return <Empty>No bills yet. Your landlord will issue a monthly bill.</Empty>
  return (
    <>
      <div className="payment-disclaimer"><strong>Payment submission only</strong><span>Affinity does not process payments. Submitting proof does not transfer money or mark a bill as paid.</span></div>
      <div className="payment-list">
        {[...bills].sort((a, b) => b.month.localeCompare(a.month)).map((bill) => (
          <PaymentBill key={bill.id} bill={bill} />
        ))}
      </div>
    </>
  )
}

function ServiceIcon({ name }) {
  const paths = {
    rent: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    electricity: <path d="m13 2-3 8h6l-5 12 1-9H7l6-11Z" />,
    water: <path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11Z" />,
    wifi: <><path d="M5 9a11 11 0 0 1 14 0M8 12a6.5 6.5 0 0 1 8 0M11 15a2 2 0 0 1 2 0" /><circle cx="12" cy="18" r=".7" /></>,
  }

  return <svg className="bill-service-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function PaymentBill({ bill }) {
  const store = useStore()
  const [proof, setProof] = useState(null)
  const [method, setMethod] = useState('GCash')
  const [reference, setReference] = useState('')
  const [upload, setUpload] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!upload) {
      setError('Upload a JPG or PNG proof of payment before submitting.')
      return
    }
    const result = await store.submitPayment(bill.id, method, reference, upload)
    if (result.error) {
      setError(result.error)
      return
    }
    setUpload(null)
    setReference('')
    setMessage('Payment details submitted for landlord review. No money was transferred by Affinity.')
  }
  return (
    <article className="panel payment-card">
      <header><div><span className="eyebrow">{monthLabel(bill.month)}</span><h2>{money(billTotal(bill))}</h2><small>Due {fmtDate(bill.due)}</small></div><Badge>{billStatus(bill)}</Badge></header>
      <dl className="bill-breakdown">
        <div><dt><ServiceIcon name="rent" />Rent</dt><dd>{money(bill.rent)}</dd></div>
        <div><dt><ServiceIcon name="electricity" />Electricity</dt><dd>{money(bill.power)}</dd></div>
        <div><dt><ServiceIcon name="water" />Water</dt><dd>{money(bill.water)}</dd></div>
        <div><dt><ServiceIcon name="wifi" />Wi-Fi / Internet</dt><dd className="bill-informational">No separate charge</dd></div>
      </dl>
      {bill.status !== 'Paid' && (
        <form className="payment-form" onSubmit={submit}>
          <Field label="Payment method"><select value={method} onChange={(event) => setMethod(event.target.value)}>{['GCash', 'Maya', 'Bank transfer', 'Cash', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Payment reference"><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Reference number or receipt ID" required /></Field>
          <div><span className="field-label">Proof of payment</span><UploadButton label={upload ? 'Replace proof' : 'Upload proof of payment'} onFile={setUpload} accept="image/*" /><small>{upload ? `${upload.name} attached` : 'JPG or PNG · up to 10 MB'}</small></div>
          <button className="btn btn-primary">Submit for review</button>
        </form>
      )}
      {bill.proof && <div className="row-actions payment-proof"><button className="link" onClick={() => setProof(bill.proof)}>View submitted proof</button>{bill.submittedAt && <small>Submitted {fmtDate(bill.submittedAt)}</small>}</div>}
      {message && <p className="success" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <FileView file={proof} title="Submitted payment proof" onClose={() => setProof(null)} />
    </article>
  )
}

function TenantTransactions({ bills, room, property }) {
  const [receipt, setReceipt] = useState(null)
  if (!bills.length) return <Empty>Your transactions will appear here after bills are issued.</Empty>
  return (
    <>
      <section className="panel tenant-panel">
        <div className="section-heading-row"><div><h2>Transactions</h2><p>Payment submissions and confirmed rental payments.</p></div></div>
        <p className="transaction-note">Payment submissions are not confirmed transfers until your landlord reviews them.</p>
        <div className="table-wrap">
          <table><thead><tr><th>Billing period</th><th>Room</th><th>Amount</th><th>Method</th><th>Reference</th><th>Payment date</th><th>Status</th><th>Receipt</th></tr></thead>
            <tbody>{[...bills].sort((a, b) => b.month.localeCompare(a.month)).map((bill) => (
              <tr key={bill.id}><td>{monthLabel(bill.month)}</td><td>{property?.name || '—'}{room && <small>Room {room.number}</small>}</td><td><strong>{money(billTotal(bill))}</strong></td><td>{bill.paymentMethod || '—'}</td><td>{bill.reference || '—'}</td><td>{fmtDate(bill.paidAt || bill.submittedAt || bill.createdAt)}</td><td><Badge>{billStatus(bill)}</Badge></td><td>{bill.proof ? <button className="link" onClick={() => setReceipt(bill.proof)}>View</button> : '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <FileView file={receipt} title="Payment receipt" onClose={() => setReceipt(null)} />
    </>
  )
}

function MaintenancePage({ tenant, property, tickets }) {
  const store = useStore()
  const [category, setCategory] = useState(MAINTENANCE_CATEGORIES[0])
  const [propertyId, setPropertyId] = useState(property?.id || '')
  const [propertyLocation, setPropertyLocation] = useState('')
  const [specificLocation, setSpecificLocation] = useState('')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [view, setView] = useState(null)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!description.trim()) {
      setError('Describe the problem before submitting the report.')
      return
    }
    const result = await store.addTicket({
      category,
      propertyId: propertyId || null,
      propertyLocation: propertyLocation.trim(),
      specificLocation: specificLocation.trim(),
      description: description.trim(),
      photo,
    })
    if (result.error) {
      setError(result.error)
      return
    }
    setDescription('')
    setPhoto(null)
    setPropertyLocation('')
    setSpecificLocation('')
    setSuccess('Your maintenance report was sent to the landlord.')
  }

  return (
    <>
      <section className="panel tenant-panel report-panel">
        <div className="section-heading-row"><div><h2>Report damage or an issue</h2><p>Describe the problem and attach a photo if helpful.</p></div></div>
        <form className="maintenance-form" onSubmit={submit}>
          <Field label="Report category"><select value={category} onChange={(event) => setCategory(event.target.value)} required>{MAINTENANCE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Property">
            <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
              {property && <option value={property.id}>{property.name} (your assigned property)</option>}
              <option value="">Not assigned / General report</option>
            </select>
          </Field>
          <Field label="Property name or location (optional)">
            <input value={propertyLocation} onChange={(event) => setPropertyLocation(event.target.value)} maxLength={240} placeholder="Enter a property name, building, or general area" />
          </Field>
          <Field label="Room or specific location (optional)">
            <input value={specificLocation} onChange={(event) => setSpecificLocation(event.target.value)} maxLength={240} placeholder="Bedroom, bathroom, kitchen, hallway, common area, or other" />
          </Field>
          <div className="maintenance-description">
            <Field label="Detailed description">
              <textarea rows="4" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} placeholder="Explain what happened, where and when you noticed it, how severe it is, and any safety concerns." required />
            </Field>
          </div>
          <div className="maintenance-photo-field">
            <span className="field-label">Photograph (optional)</span>
            <UploadButton
              label={photo ? 'Change photo' : 'Attach photo'}
              onFile={setPhoto}
              accept="image/jpeg,image/png"
              validateFile={(file) => {
                if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choose a JPG or PNG image.')
                if (file.size > 10_000_000) throw new Error('Choose an image smaller than 10 MB.')
              }}
            />
            <small>{photo ? `${photo.name} attached` : 'JPG or PNG · up to 10 MB'}</small>
            {photo && (
              <div className="maintenance-photo-preview-wrap">
                <img className="maintenance-photo-preview" src={photo.dataUrl} alt="Preview of the attached maintenance report photograph" />
                <button className="link" type="button" onClick={() => setPhoto(null)}>Remove photo</button>
              </div>
            )}
          </div>
          <button className="btn btn-primary">Submit report</button>
          {error && <p className="error" role="alert">{error}</p>}
          {success && <p className="success" role="status">{success}</p>}
        </form>
      </section>
      <section className="management-section">
        <div className="section-heading-row"><div><h2>Your maintenance reports</h2><p>Track the response and status for each issue.</p></div></div>
        {tickets.length === 0 ? <Empty>No repair requests yet.</Empty> : <div className="tenant-ticket-list">{tickets.map((ticket) => {
          const ticketRoomId = Object.hasOwn(ticket, 'roomId') ? ticket.roomId : tenant.roomId
          const ticketRoom = store.rooms.find((item) => item.id === ticketRoomId)
          const ticketProperty = store.properties.find((item) => item.id === ticket.propertyId) ||
            (!Object.hasOwn(ticket, 'propertyId') ? store.properties.find((item) =>
              item.id === tenant.propertyId || (ticketRoom && item.roomIds?.includes(ticketRoom.id))) : null)
          return (
            <article className="tenant-ticket" key={ticket.id}>
              <header><div><span className="eyebrow">{ticket.category}</span><h3>{ticket.description}</h3></div><Badge>{ticket.status === 'Open' ? 'Pending' : ticket.status}</Badge></header>
              <small>Reported {fmtDate(ticket.createdAt)}</small>
              <p><strong>Property:</strong> {ticketProperty?.name || 'General / No assigned property'}</p>
              {ticket.propertyLocation && <p><strong>Property or location details:</strong> {ticket.propertyLocation}</p>}
              {(ticket.specificLocation || ticketRoom) && <p><strong>Room or specific location:</strong> {ticket.specificLocation || `Room ${ticketRoom.number}`}</p>}
              {ticket.photo && <button className="link" onClick={() => setView(ticket.photo)}>View uploaded photograph</button>}
              {ticket.response && <p className="landlord-response"><strong>Landlord response:</strong> {ticket.response}</p>}
            </article>
          )
        })}</div>}
      </section>
      <FileView file={view} title="Reported damage photograph" onClose={() => setView(null)} />
    </>
  )
}

function TenantProfile({ tenant, displayName }) {
  return (
    <section className="panel tenant-panel profile-panel">
      <span className="avatar avatar-large">{displayName.slice(0, 1).toUpperCase()}</span>
      <span className="eyebrow">TENANT PROFILE</span><h2>{displayName}</h2>
      <dl className="facts">
        <div><dt>Email address</dt><dd>{tenant.email}</dd></div>
        <div><dt>Contact number</dt><dd>{tenant.phone || 'Not provided'}</dd></div>
        <div><dt>Move-in date</dt><dd>{fmtDate(tenant.moveIn)}</dd></div>
        <div><dt>Account status</dt><dd><Badge>{tenant.active ? 'Active' : 'Inactive'}</Badge></dd></div>
      </dl>
      <p className="muted">Contact your landlord if you need to update your profile details.</p>
    </section>
  )
}
