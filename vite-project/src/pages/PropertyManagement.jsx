import { useMemo, useState } from 'react'
import { readFile, roomStats, money, fmtDate, todayStr, useStore } from '../store'
import { Badge, Empty, Field, Modal } from '../ui'

function availableBeds(property, rooms, tenants) {
  if (typeof property.availableBeds === 'number') return property.availableBeds
  return (property.roomIds || []).reduce((total, id) => {
    const room = rooms.find((item) => item.id === id && !item.archived && !item.maintenance)
    if (!room) return total
    const stats = roomStats(room, tenants)
    return total + Math.max(0, room.capacity - stats.filled - stats.beds.filter((bed) => bed.cleaning && !bed.tenant).length)
  }, 0)
}

function PropertyPhotos({ images, onChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const selectImages = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    if (files.some((file) => !file.type.startsWith('image/'))) {
      setError('Choose image files only.')
      return
    }
    if (images.length + files.length > 10) {
      setError('A listing can include up to 10 photos.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const processed = await Promise.all(files.map(readFile))
      onChange([...images, ...processed])
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not process the selected photos.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field">
      <span>Property photographs <small>Up to 10 JPG or PNG images</small></span>
      <label className="photo-picker">
        <input type="file" accept="image/*" multiple onChange={selectImages} disabled={busy || images.length >= 10} />
        <span aria-hidden="true">＋</span> {busy ? 'Preparing photos…' : 'Add photos'}
      </label>
      {error && <small className="error" role="alert">{error}</small>}
      {images.length > 0 && (
        <div className="photo-grid">
          {images.map((image, index) => (
            <figure key={`${image.name}-${index}`}>
              <img src={image.dataUrl} alt={image.name || `Property photo ${index + 1}`} />
              <button type="button" className="photo-remove" onClick={() => onChange(images.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${image.name || 'photo'}`}>×</button>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}

function PropertyForm({ property, onClose }) {
  const store = useStore()
  const [form, setForm] = useState(() => ({
    name: property?.name || '',
    address: property?.address || '',
    city: property?.city || '',
    description: property?.description || '',
    rules: property?.rules || '',
    monthlyRate: property?.monthlyRate ?? '',
    amenities: (property?.amenities || []).join(', '),
    roomIds: property?.roomIds || store.rooms.filter((room) => !room.archived && !store.properties.some((item) => item.roomIds?.includes(room.id))).map((room) => room.id),
    images: property?.images || [],
    published: property?.published || false,
  }))
  const [error, setError] = useState('')
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const save = async (event) => {
    event.preventDefault()
    setError('')
    const payload = {
      ...form,
      monthlyRate: Number(form.monthlyRate),
      amenities: form.amenities.split(',').map((item) => item.trim()).filter(Boolean),
    }
    if (payload.published && payload.roomIds.length === 0) {
      setError('Select at least one room before publishing this listing.')
      return
    }
    const result = property
      ? await store.updateProperty(property.id, payload)
      : await store.addProperty(payload)
    if (result.error) {
      setError(result.error)
      return
    }
    onClose()
  }

  return (
    <Modal title={property ? 'Edit property listing' : 'Create property listing'} onClose={onClose} wide>
      <form className="stack property-form" onSubmit={save}>
        <div className="grid-2">
          <Field label="Property name"><input value={form.name} onChange={set('name')} placeholder="e.g. The Garden House" required /></Field>
          <Field label="Monthly rent from (₱)"><input type="number" min="0" step="0.01" value={form.monthlyRate} onChange={set('monthlyRate')} required /></Field>
        </div>
        <Field label="Complete address"><input value={form.address} onChange={set('address')} placeholder="Street, barangay, district" required /></Field>
        <Field label="City or location"><input value={form.city} onChange={set('city')} placeholder="City, province" required /></Field>
        <Field label="Description"><textarea rows="3" value={form.description} onChange={set('description')} placeholder="Describe the home, rooms, and neighborhood." /></Field>
        <Field label="Amenities and facilities" hint="Separate amenities with commas.">
          <input value={form.amenities} onChange={set('amenities')} placeholder="Wi-Fi, laundry, kitchen, CCTV" />
        </Field>
        <Field label="House rules"><textarea rows="3" value={form.rules} onChange={set('rules')} placeholder="Share quiet hours, visitor policy, and other guidelines." /></Field>
        <fieldset className="room-picker">
          <legend>Rooms in this listing</legend>
          {store.rooms.filter((room) => !room.archived || form.roomIds.includes(room.id)).length === 0 ? (
            <p className="muted">Add rooms from My Rooms before publishing availability.</p>
          ) : store.rooms.filter((room) => !room.archived || form.roomIds.includes(room.id)).map((room) => (
            <label key={room.id} title={store.properties.find((item) => item.id !== property?.id && item.roomIds?.includes(room.id)) ? 'This room is already included in another listing.' : undefined}>
              <input
                type="checkbox"
                disabled={store.properties.some((item) => item.id !== property?.id && item.roomIds?.includes(room.id))}
                checked={form.roomIds.includes(room.id)}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  roomIds: event.target.checked
                    ? [...current.roomIds, room.id]
                    : current.roomIds.filter((id) => id !== room.id),
                }))}
              />
              Room {room.number} · {room.capacity} beds · {money(room.rate)}/month
            </label>
          ))}
        </fieldset>
        <PropertyPhotos images={form.images} onChange={(images) => setForm((current) => ({ ...current, images }))} />
        <label className="check"><input type="checkbox" checked={form.published} onChange={(event) => setForm((current) => ({ ...current, published: event.target.checked }))} /> Publish this listing to tenants</label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row-actions">
          <button className="btn btn-primary">{property ? 'Save changes' : 'Create listing'}</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  )
}

function PropertyCard({ property, beds, action, actionLabel, landlord }) {
  return (
    <article className="property-card">
      <div className="property-cover">
        {property.images?.[0] ? <img src={property.images[0].dataUrl} alt={property.name} /> : <div className="property-placeholder" aria-hidden="true">⌂</div>}
        {landlord && <Badge tone={property.published ? 'green' : 'grey'}>{property.published ? 'Published' : 'Draft'}</Badge>}
      </div>
      <div className="property-card-content">
        <p className="property-location">{property.city}</p>
        <h3>{property.name}</h3>
        <p className="property-address">{property.address}</p>
        <p className="property-description">{property.description || 'A welcoming boarding house with comfortable rooms and practical amenities.'}</p>
        <div className="property-tags">
          {(property.amenities || []).slice(0, 4).map((amenity) => <span key={amenity}>{amenity}</span>)}
          <span>{beds} available {beds === 1 ? 'bed' : 'beds'}</span>
        </div>
        <div className="property-card-footer">
          <strong>{money(property.monthlyRate)}<small> / month</small></strong>
          <button className={`btn ${landlord ? '' : 'btn-primary'}`} onClick={action}>{actionLabel}</button>
        </div>
      </div>
    </article>
  )
}

function InquiryRow({ request }) {
  const store = useStore()
  const tenant = store.tenants.find((item) => item.id === request.tenantId)
  const property = store.properties.find((item) => item.id === request.propertyId)
  const [status, setStatus] = useState(({ Contacted: 'Under Review', Approved: 'Accepted', Declined: 'Rejected' })[request.status] || request.status)
  const [response, setResponse] = useState(request.response || '')
  const [message, setMessage] = useState('')
  const save = async (event) => {
    event.preventDefault()
    const result = await store.updateBooking(request.id, status, response)
    setMessage(result.error || 'Inquiry updated.')
  }
  return (
    <form className="inquiry-row" onSubmit={save}>
      <div className="inquiry-details">
        <strong>{tenant?.name || 'Tenant'} · {property?.name || 'Listing removed'}</strong>
        <small>{[tenant?.email || request.tenantEmail, tenant?.phone || request.tenantPhone].filter(Boolean).join(' · ') || 'No contact details'} · Received {fmtDate(request.createdAt)}</small>
        {request.roomId && <small>Requested room {store.rooms.find((room) => room.id === request.roomId)?.number || 'No longer listed'}</small>}
        {request.moveInDate && <small>Move-in {fmtDate(request.moveInDate)} · {request.durationMonths || '—'} month(s)</small>}
        {request.message && <p>{request.message}</p>}
      </div>
      <div className="inquiry-controls">
        <select value={status} onChange={(event) => setStatus(event.target.value)} disabled={status === 'Contract Sent'} aria-label="Inquiry status">
          {['Pending', 'Under Review', 'Accepted', 'Rejected'].map((item) => <option key={item}>{item}</option>)}
          {status === 'Contract Sent' && <option disabled>Contract Sent</option>}
        </select>
        <input value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Response or next steps" aria-label="Response to tenant" />
        <button className="btn btn-sm btn-primary">Save</button>
        {message && <small role="status">{message}</small>}
      </div>
    </form>
  )
}

export function LandlordProperties() {
  const store = useStore()
  const [editing, setEditing] = useState(undefined)
  const [error, setError] = useState('')
  const requests = store.bookingRequests || []
  const remove = async (property) => {
    if (!window.confirm(`Delete "${property.name}"? This cannot be undone.`)) return
    const result = await store.deleteProperty(property.id)
    setError(result.error || '')
  }
  const togglePublish = async (property) => {
    const result = await store.updateProperty(property.id, { published: !property.published })
    setError(result.error || '')
  }

  return (
    <>
      <div className="toolbar between">
        <div><h2 className="section-title section-title-first">My property listings</h2><p className="muted">Manage your home details, availability, and tenant inquiries.</p></div>
        <button className="btn btn-primary" onClick={() => setEditing(null)}>＋ Create listing</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {store.properties.length === 0 ? <Empty>No listings yet. Create a property listing to get started.</Empty> : (
        <div className="property-grid">
          {store.properties.map((property) => (
            <div className="property-admin-card" key={property.id}>
              <PropertyCard
                property={property}
                beds={availableBeds(property, store.rooms, store.tenants)}
                landlord
                actionLabel="Edit details"
                action={() => setEditing(property)}
              />
              <div className="property-admin-actions">
                <button className="btn btn-sm" onClick={() => togglePublish(property)}>{property.published ? 'Unpublish' : 'Publish listing'}</button>
                <button className="btn btn-sm btn-danger" onClick={() => remove(property)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <section className="management-section">
        <div className="section-heading-row"><div><h2>Booking inquiries</h2><p>Questions and booking requests from tenants.</p></div><Badge>{requests.filter((request) => request.status === 'Pending').length} pending</Badge></div>
        {requests.length === 0 ? <Empty>No booking inquiries yet.</Empty> : (
          <div className="inquiry-list">{requests.map((request) => <InquiryRow key={request.id} request={request} />)}</div>
        )}
      </section>
      {editing !== undefined && <PropertyForm property={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}

export function TenantPropertyBrowser() {
  const store = useStore()
  const [query, setQuery] = useState('')
  const [priceLimit, setPriceLimit] = useState('')
  const [selected, setSelected] = useState(null)
  const [message, setMessage] = useState('')
  const [roomId, setRoomId] = useState('')
  const [moveInDate, setMoveInDate] = useState(todayStr())
  const [durationMonths, setDurationMonths] = useState('1')
  const [error, setError] = useState('')
  const properties = useMemo(() => (store.properties || []).filter((property) => property.published).filter((property) => {
    const terms = `${property.name} ${property.address} ${property.city}`.toLowerCase()
    return terms.includes(query.trim().toLowerCase()) &&
      (!priceLimit || Number(property.monthlyRate) <= Number(priceLimit)) &&
      availableBeds(property, store.rooms, store.tenants) > 0
  }), [store.properties, store.rooms, store.tenants, query, priceLimit])
  const openListing = (property) => {
    setSelected(property)
    setRoomId('')
    setError('')
  }

  const inquire = async (event) => {
    event.preventDefault()
    const result = await store.inquireProperty(selected.id, { roomId, moveInDate, durationMonths: Number(durationMonths), message })
    if (result.error) {
      setError(result.error)
      return
    }
    setSelected(null)
    setMessage('')
    setError('')
  }

  return (
    <>
      <div className="discovery-heading">
        <div><span className="eyebrow">FIND YOUR NEXT HOME</span><h2>Browse boarding houses</h2><p>Explore available rooms and send an inquiry to the landlord.</p></div>
      </div>
      <div className="discovery-filters">
        <label><span>Search location</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Address, city, or property" /></label>
        <label><span>Maximum monthly rent</span><input type="number" min="0" value={priceLimit} onChange={(event) => setPriceLimit(event.target.value)} placeholder="Any price" /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {properties.length === 0 ? <Empty>No published properties with available rooms match your search.</Empty> : (
        <div className="property-grid">
          {properties.map((property) => (
            <PropertyCard key={property.id} property={property} beds={availableBeds(property, store.rooms, store.tenants)} actionLabel="View details" action={() => openListing(property)} />
          ))}
        </div>
      )}
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)} wide>
          <div className="listing-detail">
            {selected.images?.[0] && <img className="listing-detail-image" src={selected.images[0].dataUrl} alt={selected.name} />}
            <p className="property-address">{selected.address}, {selected.city}</p>
            <h3>{money(selected.monthlyRate)} per month · {availableBeds(selected, store.rooms, store.tenants)} beds available</h3>
            <p>{selected.description}</p>
            <section className="listing-rooms"><strong>Available rooms</strong>
              {(selected.roomIds || []).map((id) => store.rooms.find((room) => room.id === id))
                .filter((room) => room && !room.archived && !room.maintenance && room.availableBeds > 0)
                .map((room) => <div key={room.id}><span>Room {room.number}<small>{room.availableBeds} available {room.availableBeds === 1 ? 'bed' : 'beds'}</small></span><strong>{money(room.rate)}<small> / month</small></strong></div>)}
            </section>
            {!!selected.amenities?.length && <p><strong>Amenities:</strong> {selected.amenities.join(' · ')}</p>}
            {selected.rules && <p><strong>House rules:</strong> {selected.rules}</p>}
            <form className="stack" onSubmit={inquire}>
              <Field label="Room requested">
                <select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
                  <option value="">Any available room</option>
                  {(selected.roomIds || []).map((id) => store.rooms.find((room) => room.id === id))
                    .filter((room) => room && !room.archived && !room.maintenance && room.availableBeds > 0)
                    .map((room) => <option key={room.id} value={room.id}>Room {room.number} · {money(room.rate)}/month</option>)}
                </select>
              </Field>
              <div className="grid-2">
                <Field label="Desired move-in date"><input type="date" min={todayStr()} value={moveInDate} onChange={(event) => setMoveInDate(event.target.value)} required /></Field>
                <Field label="Desired rental duration (months)"><input type="number" min="1" max="60" step="1" value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)} required /></Field>
              </div>
              <Field label="Additional message or questions"><textarea rows="3" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} placeholder="Ask a question or share details about your move." /></Field>
              <button className="btn btn-primary">Send booking inquiry</button>
            </form>
          </div>
        </Modal>
      )}
    </>
  )
}

export function TenantBookings() {
  const store = useStore()
  const requests = store.bookingRequests || []
  if (!requests.length) return <Empty>You haven't sent a booking inquiry yet. Browse published boarding houses to get started.</Empty>
  return (
    <div className="inquiry-list">
      {requests.map((request) => {
        const property = store.properties.find((item) => item.id === request.propertyId)
        const room = store.rooms.find((item) => item.id === request.roomId)
        return (
          <article className="inquiry-row" key={request.id}>
            <div className="inquiry-details"><strong>{property?.name || 'Property listing'}</strong><small>{room ? `Room ${room.number} · ` : ''}Sent {fmtDate(request.createdAt)}</small>{request.moveInDate && <small>Requested move-in {fmtDate(request.moveInDate)} · {request.durationMonths} month(s)</small>}{request.message && <p>{request.message}</p>}{request.response && <p className="landlord-response"><strong>Landlord response:</strong> {request.response}</p>}</div>
            <Badge>{request.status}</Badge>
          </article>
        )
      })}
    </div>
  )
}
