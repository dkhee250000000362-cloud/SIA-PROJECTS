import { useMemo, useState } from 'react'
import { useStore, billStatus, billTotal, fmtDate, money, monthLabel } from '../store'
import { Badge, Empty, FileView } from '../ui'

export function Transactions() {
  const store = useStore()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [receipt, setReceipt] = useState(null)
  const paid = store.bills.filter((bill) => bill.status === 'Paid')
  const pending = store.bills.filter((bill) => billStatus(bill) === 'Pending')
  const overdue = store.bills.filter((bill) => billStatus(bill) === 'Overdue')
  const total = (bills) => bills.reduce((sum, bill) => sum + billTotal(bill), 0)
  const rows = useMemo(() => store.bills
    .map((bill) => ({
      bill,
      tenant: store.tenants.find((tenant) => tenant.id === bill.tenantId),
      room: store.rooms.find((room) => room.id === store.tenants.find((tenant) => tenant.id === bill.tenantId)?.roomId),
    }))
    .map((row) => ({
      ...row,
      property: store.properties.find((item) => item.roomIds?.includes(row.room?.id)),
    }))
    .filter(({ bill, tenant, room, property }) => {
      const state = billStatus(bill)
      const haystack = `${tenant?.name || ''} ${tenant?.email || ''} ${room?.number || ''} ${property?.name || ''} ${bill.reference || ''}`.toLowerCase()
      return (filter === 'All' || state === filter) && haystack.includes(query.trim().toLowerCase())
    })
    .sort((a, b) => String(b.bill.submittedAt || b.bill.paidAt || b.bill.createdAt || b.bill.month).localeCompare(
      String(a.bill.submittedAt || a.bill.paidAt || a.bill.createdAt || a.bill.month),
    )), [store.bills, store.rooms, store.tenants, filter, query])

  return (
    <>
      <div className="stats">
        <SummaryCard label="Payments collected" value={money(total(paid))} detail={`${paid.length} confirmed payments`} />
        <SummaryCard label="Pending payments" value={money(total(pending))} detail={`${pending.length} awaiting confirmation`} />
        <SummaryCard label="Overdue balance" value={money(total(overdue))} detail={`${overdue.length} overdue bills`} />
      </div>
      <section className="management-section">
        <div className="section-heading-row"><div><h2>Transaction history</h2><p>Payment submissions and confirmed rent payments.</p></div><span className="transaction-note">Payment submissions are not confirmed transfers.</span></div>
        <div className="table-tools">
          <label className="search-field"><span className="sr-only">Search transactions</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tenant, room, reference…" /></label>
          <label><span className="sr-only">Filter by payment status</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All</option><option>Paid</option><option>Pending</option><option>Overdue</option></select></label>
        </div>
        {rows.length === 0 ? <Empty>No transactions match your search.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tenant</th><th>Property / room</th><th>Billing period</th><th>Amount</th><th>Payment method</th><th>Reference</th><th>Payment date</th><th>Status</th><th>Proof</th></tr></thead>
              <tbody>
                {rows.map(({ bill, tenant, room, property }) => (
                  <tr key={bill.id}>
                    <td><strong>{tenant?.name || 'Unknown tenant'}</strong><small>{tenant?.email || ''}</small></td>
                    <td>{property?.name || '—'}{room && <small>Room {room.number}</small>}</td>
                    <td>{monthLabel(bill.month)}</td>
                    <td><strong>{money(billTotal(bill))}</strong></td>
                    <td>{bill.paymentMethod || '—'}</td>
                    <td>{bill.reference || '—'}</td>
                    <td>{fmtDate(bill.paidAt || bill.submittedAt || bill.createdAt)}</td>
                    <td><Badge>{billStatus(bill)}</Badge></td>
                    <td>{bill.proof ? <button className="link" onClick={() => setReceipt(bill.proof)}>View proof</button> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <FileView file={receipt} title="Submitted payment proof" onClose={() => setReceipt(null)} />
    </>
  )
}

function SummaryCard({ label, value, detail }) {
  return <article className="stat"><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>
}

export function AuditReports() {
  const store = useStore()
  const logs = [...(store.auditLog || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const exportReport = () => {
    const header = ['Date', 'Actor', 'Role', 'Action']
    const lines = logs.map((entry) => [
      entry.createdAt,
      entry.actorId,
      entry.actorRole,
      entry.action,
    ].map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(','))
    const blob = new Blob([[header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'affinity-audit-report.csv'
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <section className="management-section">
      <div className="section-heading-row"><div><h2>Audit report</h2><p>Recent account actions recorded by the workspace.</p></div><button className="btn" onClick={exportReport} disabled={logs.length === 0}>Export CSV</button></div>
      {logs.length === 0 ? <Empty>New changes will appear here as activity is recorded.</Empty> : (
        <div className="table-wrap">
          <table><thead><tr><th>When</th><th>Account</th><th>Role</th><th>Action</th></tr></thead>
            <tbody>{logs.map((entry) => (
              <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleString('en-PH')}</td><td>{entry.actorId === store.session?.id ? 'You' : entry.actorId}</td><td><Badge>{entry.actorRole}</Badge></td><td>{entry.action.replaceAll('.', ' ')}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function AccountSettings() {
  const { landlord, session } = useStore()
  return (
    <section className="settings-grid">
      <article className="panel settings-card">
        <span className="eyebrow">ACCOUNT</span>
        <h2>Landlord profile</h2>
        <dl className="facts">
          <div><dt>Full name</dt><dd>{landlord?.name || session?.name || '—'}</dd></div>
          <div><dt>Email address</dt><dd>{landlord?.email || session?.email || '—'}</dd></div>
          <div><dt>Boarding house</dt><dd>{landlord?.propertyName || '—'}</dd></div>
          <div><dt>Account type</dt><dd>Landlord</dd></div>
        </dl>
      </article>
      <article className="panel settings-card">
        <span className="eyebrow">PRIVACY &amp; PAYMENTS</span>
        <h2>Workspace information</h2>
        <p>Listing, tenant, billing, and maintenance records are saved to the connected boarding-house database.</p>
        <p>Payment proof uploads are review requests. Affinity does not process payments or transfer funds.</p>
      </article>
    </section>
  )
}
