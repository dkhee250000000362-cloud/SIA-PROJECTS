import { useState } from 'react'
import { useStore, money, fmtDate, monthLabel, billTotal, billStatus } from '../store'
import { Badge, Field, UploadButton, FileView, Empty } from '../ui'

const CATEGORIES = ['Plumbing', 'Electric', 'Wi-Fi', 'Aircon', 'Other']

export default function UserDashboard() {
  const store = useStore()
  const tenant = store.tenants.find((t) => t.id === store.session?.tenantId)
  const [tab, setTab] = useState('Bills')

  if (!tenant) {
    return (
      <main className="portal">
        <Empty>We couldn't find your profile.</Empty>
        <button className="btn" onClick={store.logout}>Back to sign in</button>
      </main>
    )
  }

  const room = store.rooms.find((r) => r.id === tenant.roomId)
  const bills = store.bills.filter((b) => b.tenantId === tenant.id).sort((a, b) => b.month.localeCompare(a.month))
  const owed = bills.filter((b) => b.status !== 'Paid').reduce((s, b) => s + billTotal(b), 0)
  const tickets = store.tickets.filter((t) => t.tenantId === tenant.id)

  return (
    <div className="portal">
      <header className="portal-head">
        <div className="portal-brand">
          <span className="brand-mark" aria-hidden="true">A</span>
          <div>
            <small>AFFINITY · BOARDER PORTAL</small>
            <h2>Good to see you, {tenant.name.split(' ')[0]}.</h2>
            <p>Your home, payments, and requests — all in one place.</p>
          </div>
        </div>
        <button className="btn btn-sm portal-signout" onClick={store.logout}>Sign out <span aria-hidden="true">↗</span></button>
      </header>

      <section className="my-room">
        <div>
          <small><span aria-hidden="true">⌂</span> YOUR ROOM</small>
          <strong>{room ? `Room ${room.number}, Bed ${tenant.bed}` : 'Not assigned yet'}</strong>
        </div>
        <div>
          <small><span aria-hidden="true">◷</span> LEASE ENDS</small>
          <strong>{fmtDate(tenant.leaseEnd)}</strong>
        </div>
        <div>
          <small><span aria-hidden="true">₱</span> AMOUNT DUE</small>
          <strong className={owed > 0 ? 'due' : ''}>{money(owed)}</strong>
        </div>
      </section>

      <div className="portal-section-heading">
        <div>
          <span className="eyebrow">YOUR STAY</span>
          <h3>Home overview</h3>
        </div>
        <span className="portal-live"><i aria-hidden="true" /> Everything in one place</span>
      </div>

      <div className="tabs tabs-wide" role="tablist">
        {['Bills', 'Repairs'].map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t}
            {t === 'Repairs' && tickets.filter((x) => x.status !== 'Resolved').length > 0 && (
              <span className="count">{tickets.filter((x) => x.status !== 'Resolved').length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'Bills' ? <MyBills bills={bills} /> : <MyRepairs tenantId={tenant.id} tickets={tickets} />}
    </div>
  )
}

function MyBills({ bills }) {
  const store = useStore()
  const [proof, setProof] = useState(null)

  if (bills.length === 0) return <Empty>No bills yet. Your landlord will issue one each month.</Empty>

  return (
    <>
      <ul className="bill-list">
        {bills.map((b) => {
          const status = billStatus(b)
          return (
            <li key={b.id} className="bill">
              <header>
                <strong>{monthLabel(b.month)}</strong>
                <Badge>{status}</Badge>
              </header>
              <dl>
                <div><dt>Rent</dt><dd>{money(b.rent)}</dd></div>
                <div><dt>Electricity</dt><dd>{money(b.power)}</dd></div>
                <div><dt>Water</dt><dd>{money(b.water)}</dd></div>
                <div className="total"><dt>Total</dt><dd>{money(billTotal(b))}</dd></div>
              </dl>
              <small className="muted">Due {fmtDate(b.due)}</small>
              {status !== 'Paid' && (
                <div className="row-actions">
                  {b.proof ? (
                    <>
                      <button className="btn btn-sm" onClick={() => setProof(b.proof)}>View my receipt</button>
                      <UploadButton label="Replace receipt" className="btn btn-sm" onFile={(f) => store.attachProof(b.id, f)} />
                      <small className="muted">Waiting for your landlord to confirm.</small>
                    </>
                  ) : (
                    <UploadButton label="Upload GCash / Maya receipt" className="btn btn-primary" onFile={(f) => store.attachProof(b.id, f)} />
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <FileView file={proof} title="My receipt" onClose={() => setProof(null)} />
    </>
  )
}

function MyRepairs({ tenantId, tickets }) {
  const store = useStore()
  const [category, setCategory] = useState(CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState(null)
  const [sent, setSent] = useState(false)
  const [view, setView] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    const result = await store.addTicket({ tenantId, category, description: description.trim(), photo })
    if (result.error) return
    setDescription('')
    setPhoto(null)
    setSent(true)
    setTimeout(() => setSent(false), 3000)
  }

  return (
    <>
      <form className="panel stack" onSubmit={submit}>
        <h3 className="section-title">Report a problem</h3>
        <Field label="What kind of problem?">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="What happened?">
          <textarea rows="3" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Example: the bathroom faucet is leaking" required />
        </Field>
        <div className="row-actions">
          <UploadButton label={photo ? 'Change photo' : 'Add a photo'} onFile={setPhoto} />
          {photo && <small className="success">Photo attached</small>}
        </div>
        <button className="btn btn-primary">Send request</button>
        {sent && <p className="success" role="status">Request sent. Your landlord can see it now.</p>}
      </form>

      <h3 className="section-title">My requests</h3>
      {tickets.length === 0 ? (
        <Empty>You haven't reported anything.</Empty>
      ) : (
        <ul className="rows">
          {tickets.map((t) => (
            <li key={t.id}>
              <div>
                <strong>{t.category}</strong>
                <small>{t.description}</small>
                <small className="muted">{fmtDate(t.createdAt)}</small>
              </div>
              <div className="row-actions">
                {t.photo && <button className="btn btn-sm" onClick={() => setView(t.photo)}>Photo</button>}
                <Badge>{t.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
      <FileView file={view} title="Photo of the problem" onClose={() => setView(null)} />
    </>
  )
}