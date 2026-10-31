import { useEffect, useRef, useState } from 'react'
import { readFile } from './store'

const TONES = {
  Occupied: 'green', Paid: 'green', Resolved: 'green',
  Vacant: 'blue', Open: 'blue',
  'Partially occupied': 'amber', Pending: 'amber', 'In Progress': 'amber',
  Maintenance: 'grey', Inactive: 'grey',
  Overdue: 'red',
}

export function Badge({ children, tone }) {
  return <span className={`badge badge-${tone || TONES[children] || 'grey'}`}>{children}</span>
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

/** Button that opens the file picker and returns a processed file via onFile. */
export function UploadButton({ label, onFile, className = 'btn', accept = 'image/*,application/pdf', validateFile }) {
  const ref = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setBusy(true)
    try {
      validateFile?.(file)
      await onFile(await readFile(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="upload">
      <input ref={ref} type="file" accept={accept} onChange={pick} hidden />
      <button type="button" className={className} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? 'Uploading…' : label}
      </button>
      {error && <small className="error" role="alert">{error}</small>}
    </span>
  )
}

/** Shows an image inline or a download link for PDFs. */
export function FileView({ file, onClose, title }) {
  if (!file) return null
  return (
    <Modal title={title || file.name || 'File'} onClose={onClose} wide>
      {file.type === 'application/pdf' ? (
        <a className="btn btn-primary" href={file.dataUrl} download={file.name || 'document.pdf'}>
          Download PDF
        </a>
      ) : (
        <img className="preview" src={file.dataUrl} alt={title || file.name || 'Uploaded file'} />
      )}
    </Modal>
  )
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>
}
