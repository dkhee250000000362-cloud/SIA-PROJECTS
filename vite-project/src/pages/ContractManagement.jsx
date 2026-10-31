import { useState } from 'react'
import { Badge, Empty, Field } from '../ui'
import { fmtDate, money, todayStr, useStore } from '../store'

const dateLabel = (value) => fmtDate(typeof value === 'string' ? value.slice(0, 10) : '')
const roomName = (store, contract) =>
  contract.roomNumber || store.rooms.find((room) => room.id === contract.roomId)?.number || 'Not specified'
const printDocument = () => window.print()

function ContractDetails({ contract, room }) {
  return (
    <dl className="contract-facts">
      <div><dt>Contract number</dt><dd>{contract.contractNumber}</dd></div>
      <div><dt>Tenant</dt><dd>{contract.tenantName} · {contract.tenantEmail}{contract.tenantPhone ? ` · ${contract.tenantPhone}` : ''}</dd></div>
      <div><dt>Landlord</dt><dd>{contract.landlordName}{contract.landlordEmail ? ` · ${contract.landlordEmail}` : ''}{contract.landlordPhone ? ` · ${contract.landlordPhone}` : ''}</dd></div>
      <div><dt>Property</dt><dd>{contract.propertyName} · {contract.propertyAddress}</dd></div>
      <div><dt>Room</dt><dd>{room}</dd></div>
      <div><dt>Monthly rent</dt><dd>{money(contract.monthlyRent)}</dd></div>
      <div><dt>Security deposit</dt><dd>{money(contract.securityDeposit)}</dd></div>
      <div><dt>Payment terms</dt><dd>{contract.paymentTerms}</dd></div>
      <div><dt>Contract dates</dt><dd>{dateLabel(contract.startDate)} – {dateLabel(contract.endDate)}</dd></div>
      <div><dt>Total rental duration</dt><dd>{contract.durationDays ? `${contract.durationDays} days` : `${Number(contract.durationMonths).toLocaleString('en-PH', { maximumFractionDigits: 2 })} month(s)`}</dd></div>
      <div><dt>House rules and conditions</dt><dd>{contract.houseRules || 'No additional house rules specified.'}</dd></div>
      <div><dt>Additional agreement or notes</dt><dd>{contract.additionalNotes || 'None'}</dd></div>
      <div><dt>Contract created</dt><dd>{dateLabel(contract.createdAt)}</dd></div>
      {contract.sentAt && <div><dt>Contract sent</dt><dd>{new Date(contract.sentAt).toLocaleString('en-PH')}</dd></div>}
      {contract.acceptedAt && <div><dt>Tenant accepted</dt><dd>{new Date(contract.acceptedAt).toLocaleString('en-PH')}</dd></div>}
      {contract.signature && <div><dt>Electronic signature</dt><dd>{contract.signature}</dd></div>}
      {(contract.endDateHistory || []).map((change, index) => (
        <div key={`${change.approvedAt}-${index}`}><dt>Approved extension</dt><dd>{dateLabel(change.previousEndDate)} → {dateLabel(change.newEndDate)} · {change.additionalDays} day(s) · {money(change.additionalCost)}</dd></div>
      ))}
    </dl>
  )
}

function ContractDraft({ contract, onSent }) {
  const store = useStore()
  const [form, setForm] = useState(() => ({
    landlordName: contract.landlordName,
    landlordEmail: contract.landlordEmail || '',
    landlordPhone: contract.landlordPhone || '',
    tenantName: contract.tenantName,
    tenantEmail: contract.tenantEmail || '',
    tenantPhone: contract.tenantPhone || '',
    propertyName: contract.propertyName,
    propertyAddress: contract.propertyAddress,
    roomNumber: contract.roomNumber || '',
    monthlyRent: String(contract.monthlyRent),
    securityDeposit: String(contract.securityDeposit),
    paymentTerms: contract.paymentTerms || '',
    startDate: contract.startDate,
    endDate: contract.endDate,
    durationMonths: String(contract.durationMonths),
    houseRules: contract.houseRules || '',
    additionalNotes: contract.additionalNotes || '',
  }))
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const save = async () => {
    setError('')
    setMessage('')
    const result = await store.updateContract(contract.id, {
      ...form,
      monthlyRent: Number(form.monthlyRent),
      securityDeposit: Number(form.securityDeposit),
      durationMonths: Number(form.durationMonths),
    })
    if (result.error) {
      setError(result.error)
      return false
    }
    setMessage('Draft saved.')
    return true
  }

  const send = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    const result = await store.sendContract(contract.id, {
      ...form,
      monthlyRent: Number(form.monthlyRent),
      securityDeposit: Number(form.securityDeposit),
      durationMonths: Number(form.durationMonths),
    })
    if (result.error) {
      setError(result.error)
      return
    }
    onSent()
  }

  return (
    <form className="stack contract-editor" onSubmit={send}>
      <div className="grid-2">
        <Field label="Landlord name"><input value={form.landlordName} onChange={set('landlordName')} required /></Field>
        <Field label="Landlord email"><input type="email" value={form.landlordEmail} onChange={set('landlordEmail')} /></Field>
      </div>
      <Field label="Landlord contact number"><input value={form.landlordPhone} onChange={set('landlordPhone')} /></Field>
      <div className="grid-2">
        <Field label="Tenant name"><input value={form.tenantName} onChange={set('tenantName')} required /></Field>
        <Field label="Tenant email"><input type="email" value={form.tenantEmail} onChange={set('tenantEmail')} required /></Field>
      </div>
      <Field label="Tenant contact number"><input value={form.tenantPhone} onChange={set('tenantPhone')} /></Field>
      <div className="grid-2">
        <Field label="Boarding house"><input value={form.propertyName} onChange={set('propertyName')} required /></Field>
        <Field label="Complete address"><input value={form.propertyAddress} onChange={set('propertyAddress')} required /></Field>
      </div>
      <Field label="Room identification"><input value={form.roomNumber} onChange={set('roomNumber')} placeholder="Room number or identification" /></Field>
      <div className="grid-2">
        <Field label="Monthly rent (₱)"><input type="number" min="0" step="0.01" value={form.monthlyRent} onChange={set('monthlyRent')} required /></Field>
        <Field label="Security deposit (₱)"><input type="number" min="0" step="0.01" value={form.securityDeposit} onChange={set('securityDeposit')} required /></Field>
      </div>
      <Field label="Payment terms"><textarea rows="2" value={form.paymentTerms} onChange={set('paymentTerms')} required /></Field>
      <div className="grid-2">
        <Field label="Contract start date"><input type="date" value={form.startDate} onChange={set('startDate')} required /></Field>
        <Field label="Contract end date"><input type="date" value={form.endDate} onChange={set('endDate')} required /></Field>
      </div>
      <Field label="Rental duration (months)"><input type="number" min="1" max="60" step="1" value={form.durationMonths} onChange={set('durationMonths')} required /></Field>
      <Field label="House rules and conditions"><textarea rows="3" value={form.houseRules} onChange={set('houseRules')} /></Field>
      <Field label="Additional agreement or notes"><textarea rows="3" value={form.additionalNotes} onChange={set('additionalNotes')} /></Field>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      <div className="row-actions">
        <button type="button" className="btn" onClick={save}>Save draft</button>
        <button className="btn btn-primary">Send contract to tenant</button>
      </div>
    </form>
  )
}

export function LandlordContracts() {
  const store = useStore()
  const [message, setMessage] = useState('')
  const contracts = store.contracts || []
  const acceptedInquiries = (store.bookingRequests || []).filter((request) =>
    ['Accepted', 'Approved'].includes(request.status) &&
    !contracts.some((contract) => contract.inquiryId === request.id))

  const create = async (inquiry) => {
    setMessage('')
    const result = await store.createContract(inquiry.id)
    setMessage(result.error || 'Rental contract draft created.')
  }

  return (
    <div className="contract-page">
      <section className="management-section contract-section">
        <div className="section-heading-row"><div><h2>Accepted rental inquiries</h2><p>Prepare a contract after accepting a tenant inquiry.</p></div><Badge>{acceptedInquiries.length} ready</Badge></div>
        {acceptedInquiries.length === 0 ? <Empty>Accepted inquiries that do not yet have a contract will appear here.</Empty> : (
          <div className="contract-list">
            {acceptedInquiries.map((inquiry) => {
              const tenant = store.tenants.find((item) => item.id === inquiry.tenantId)
              const property = store.properties.find((item) => item.id === inquiry.propertyId)
              const room = store.rooms.find((item) => item.id === inquiry.roomId)
              return (
                <article className="panel contract-card" key={inquiry.id}>
                  <div className="section-heading-row"><div><h3>{tenant?.name || inquiry.tenantName || 'Tenant'} · {property?.name || 'Property'}</h3><p>{room ? `Room ${room.number} · ` : ''}{tenant?.email || inquiry.tenantEmail || 'No tenant email'}</p></div><Badge>Accepted inquiry</Badge></div>
                  <p>Desired move-in: {dateLabel(inquiry.moveInDate)} · {inquiry.durationMonths || 1} month(s)</p>
                  <button className="btn btn-primary" onClick={() => create(inquiry)}>Prepare rental contract</button>
                </article>
              )
            })}
          </div>
        )}
        {message && <p className={message.startsWith('Rental') ? 'success' : 'error'} role={message.startsWith('Rental') ? 'status' : 'alert'}>{message}</p>}
      </section>
      <section className="management-section contract-section">
        <div className="section-heading-row"><div><h2>Rental contracts</h2><p>Review drafts, sent contracts, and tenant decisions.</p></div></div>
        {contracts.length === 0 ? <Empty>No rental contracts yet.</Empty> : (
          <div className="contract-list">
            {contracts.map((contract) => (
              <article className="panel contract-card" key={contract.id}>
                <header className="contract-heading"><div><span className="eyebrow">{contract.contractNumber}</span><h3>{contract.tenantName} · {contract.propertyName}</h3></div><Badge>{contract.status === 'Sent' ? 'Awaiting Tenant Acceptance' : contract.status}</Badge></header>
                {contract.status === 'Draft'
                  ? <ContractDraft contract={contract} onSent={() => setMessage('Contract sent to tenant for review.')} />
                  : <>
                    <ContractDetails contract={contract} room={roomName(store, contract)} />
                    {contract.rejectedAt && <p className="error">Tenant rejected this contract on {new Date(contract.rejectedAt).toLocaleString('en-PH')}.</p>}
                    <div className="row-actions">
                      <button className="btn btn-sm" onClick={printDocument}>Print / download PDF</button>
                      {['Accepted', 'Awaiting Tenant Acceptance'].includes(contract.status) && (
                        <label className="contract-status-control">Status
                          <select value={contract.status} onChange={(event) => store.setContractStatus(contract.id, event.target.value)} aria-label={`Update status for ${contract.contractNumber}`}>
                            <option value={contract.status}>{contract.status}</option>
                            {contract.status === 'Accepted' && <><option>Completed</option><option>Expired</option></>}
                            {contract.status === 'Awaiting Tenant Acceptance' && <option>Expired</option>}
                          </select>
                        </label>
                      )}
                    </div>
                  </>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ExtensionRequestForm({ contract }) {
  const store = useStore()
  const [days, setDays] = useState('7')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const requestedEndDate = new Date(`${contract.endDate}T00:00:00Z`)
  requestedEndDate.setUTCDate(requestedEndDate.getUTCDate() + (Number(days) || 0))
  const newEndDate = Number(days) > 0 ? requestedEndDate.toISOString().slice(0, 10) : ''
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const result = await store.requestExtension(contract.id, Number(days), reason)
    if (result.error) {
      setError(result.error)
      return
    }
    setSent(true)
    setReason('')
  }

  if (sent) return <p className="success" role="status">Your extension request has been sent to the landlord.</p>
  return (
    <form className="stack extension-form" onSubmit={submit}>
      <div className="grid-2">
        <Field label="Current contract end date"><input value={dateLabel(contract.endDate)} readOnly /></Field>
        <Field label="Requested new end date"><input value={dateLabel(newEndDate)} readOnly /></Field>
      </div>
      <Field label="Additional rental days"><input type="number" min="1" max="365" value={days} onChange={(event) => setDays(event.target.value)} required /></Field>
      <p className="muted">Estimated additional rent: {money(Number(contract.monthlyRent) / 30 * (Number(days) || 0))}. The landlord confirms the final charge.</p>
      <Field label="Reason for extension"><textarea rows="3" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} required placeholder="Explain why you need additional days." /></Field>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary">Submit extension request</button>
    </form>
  )
}

function TenantContractCard({ contract }) {
  const store = useStore()
  const [signature, setSignature] = useState('')
  const [error, setError] = useState('')
  const [extensionsOpen, setExtensionsOpen] = useState(false)
  const extensions = (store.extensionRequests || []).filter((request) => request.contractId === contract.id)
  const mayExtend = contract.status === 'Accepted' && contract.endDate >= todayStr()

  const decide = async (decision) => {
    setError('')
    if (decision === 'Rejected' && !window.confirm('Reject this rental contract?')) return
    const result = await store.decideContract(contract.id, decision, signature)
    if (result.error) setError(result.error)
  }

  const cancel = async (extension) => {
    const result = await store.cancelExtension(extension.id)
    if (result.error) setError(result.error)
  }

  return (
    <article className="panel contract-card">
      <header className="contract-heading"><div><span className="eyebrow">{contract.contractNumber}</span><h3>{contract.propertyName}</h3></div><Badge>{contract.status === 'Sent' ? 'Awaiting Tenant Acceptance' : contract.status}</Badge></header>
      <ContractDetails contract={contract} room={roomName(store, contract)} />
      {contract.status === 'Awaiting Tenant Acceptance' && (
        <section className="contract-decision">
          <Field label="Electronic signature (type your full registered name)">
            <input value={signature} onChange={(event) => setSignature(event.target.value)} autoComplete="name" />
          </Field>
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => decide('Accepted')}>Accept and sign contract</button>
            <button className="btn" onClick={() => decide('Rejected')}>Reject contract</button>
          </div>
        </section>
      )}
      {contract.status === 'Accepted' && (
        <section className="contract-extension">
          <div className="section-heading-row"><div><h4>Contract extension</h4><p>Current end date: {dateLabel(contract.endDate)}</p></div>
            {mayExtend && <button className="btn btn-sm btn-primary" onClick={() => setExtensionsOpen((open) => !open)}>Request Contract Extension</button>}
          </div>
          {extensionsOpen && mayExtend && <ExtensionRequestForm contract={contract} />}
          {extensions.map((extension) => (
            <div className="extension-history-row" key={extension.id}>
              <div><strong>{extension.additionalDays} additional day(s): {dateLabel(extension.originalEndDate)} → {dateLabel(extension.requestedEndDate)}</strong><small>Requested {new Date(extension.submittedAt).toLocaleString('en-PH')} · Proposed cost {money(extension.proposedAdditionalCost)}</small><p>{extension.reason}</p>
                {extension.status === 'Approved' && <p>Approved charge: {money(extension.additionalCost)}{extension.landlordNotes ? ` · ${extension.landlordNotes}` : ''}</p>}
                {extension.landlordNotes && extension.status === 'Rejected' && <p>Landlord note: {extension.landlordNotes}</p>}
              </div>
              <Badge>{extension.status}</Badge>
              {extension.status === 'Pending' && <button className="btn btn-sm" onClick={() => cancel(extension)}>Cancel request</button>}
            </div>
          ))}
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-actions"><button className="btn btn-sm" onClick={printDocument}>Print / download PDF</button></div>
    </article>
  )
}

export function TenantContracts() {
  const { contracts = [] } = useStore()
  return (
    <section className="contract-page">
      <div className="section-heading-row"><div><h2>Your rental contracts</h2><p>Review contracts, record your decision, and request approved extensions.</p></div></div>
      {contracts.length === 0 ? <Empty>Contracts sent by your landlord will appear here.</Empty> : (
        <div className="contract-list">{contracts.map((contract) => <TenantContractCard key={contract.id} contract={contract} />)}</div>
      )}
    </section>
  )
}

function ExtensionReviewCard({ extension }) {
  const store = useStore()
  const tenant = store.tenants.find((item) => item.id === extension.tenantId)
  const contract = store.contracts.find((item) => item.id === extension.contractId)
  const [cost, setCost] = useState(String(extension.additionalCost ?? extension.proposedAdditionalCost ?? 0))
  const [notes, setNotes] = useState(extension.landlordNotes || '')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const review = async (status) => {
    setError('')
    setMessage('')
    const result = await store.reviewExtension(extension.id, status, Number(cost), notes)
    if (result.error) setError(result.error)
    else setMessage(`Extension request ${status.toLowerCase()}.`)
  }

  return (
    <article className="panel extension-review-card">
      <header className="contract-heading"><div><span className="eyebrow">{extension.contractNumber}</span><h3>{tenant?.name || 'Tenant'} · {contract?.propertyName || 'Property'}</h3></div><Badge>{extension.status}</Badge></header>
      <dl className="contract-facts">
        <div><dt>Tenant contact</dt><dd>{[tenant?.email, tenant?.phone].filter(Boolean).join(' · ') || 'Not available'}</dd></div>
        <div><dt>Original contract end date</dt><dd>{dateLabel(extension.originalEndDate)}</dd></div>
        <div><dt>Additional days requested</dt><dd>{extension.additionalDays}</dd></div>
        <div><dt>Requested new end date</dt><dd>{dateLabel(extension.requestedEndDate)}</dd></div>
        <div><dt>Reason</dt><dd>{extension.reason}</dd></div>
        <div><dt>Submitted</dt><dd>{new Date(extension.submittedAt).toLocaleString('en-PH')}</dd></div>
      </dl>
      {extension.status === 'Pending' ? (
        <>
          <Field label={`Additional rental charge (₱) · suggested ${money(extension.proposedAdditionalCost)}`}><input type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} /></Field>
          <Field label="Landlord notes or conditions"><textarea rows="2" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /></Field>
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => review('Approved')}>Approve extension</button>
            <button className="btn" onClick={() => review('Rejected')}>Reject request</button>
          </div>
        </>
      ) : <p>{extension.status === 'Approved' ? `Approved charge: ${money(extension.additionalCost)}` : ''} {extension.landlordNotes}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
    </article>
  )
}

export function LandlordExtensions() {
  const { extensionRequests = [] } = useStore()
  return (
    <section className="contract-page">
      <div className="section-heading-row"><div><h2>Extension requests</h2><p>Review additional days requested and approve or reject with updated charges.</p></div><Badge>{extensionRequests.filter((request) => request.status === 'Pending').length} pending</Badge></div>
      {extensionRequests.length === 0 ? <Empty>Tenant extension requests will appear here.</Empty> : (
        <div className="contract-list">{extensionRequests.map((extension) => <ExtensionReviewCard key={extension.id} extension={extension} />)}</div>
      )}
    </section>
  )
}
