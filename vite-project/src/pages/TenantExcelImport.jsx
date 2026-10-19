import { useState } from 'react'
import { Modal } from '../ui'

const HEADERS = [
  'Full Name',
  'Mobile Number',
  'Email',
  'Emergency Contact Name',
  'Emergency Contact Number',
  'Move-in Date',
  'Lease Ends',
]

const REQUIRED_FIELDS = ['name', 'phone', 'email', 'emergency', 'emergencyPhone', 'moveIn']
const HEADER_ALIASES = {
  name: ['fullname', 'name', 'boardername', 'tenantname'],
  phone: ['mobilenumber', 'mobile', 'phone', 'phonenumber'],
  email: ['email', 'emailaddress'],
  emergency: ['emergencycontactname', 'emergencyname', 'emergencycontact'],
  emergencyPhone: ['emergencycontactnumber', 'emergencyphone', 'emergencyphonenumber'],
  moveIn: ['moveindate', 'movein', 'dateofmovein'],
  leaseEnd: ['leaseends', 'leaseend', 'leaseenddate'],
}

function normalizeHeader(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function excelCellValue(value) {
  if (value == null) return ''
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if (value.formula || value.sharedFormula) return value.result ?? ''
    if (value.text != null) return value.text
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
  }
  return value
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      if (char === '\r' && text[i + 1] === '\n') i += 1
    } else {
      field += char
    }
  }

  if (quoted) throw new Error('The CSV file has an unfinished quoted value.')
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.map((values, index) => ({ number: index + 1, values }))
}

function dateToIso(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
    return date.toISOString().slice(0, 10)
  }

  const text = String(value ?? '').trim()
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const date = new Date(`${text}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : ''
  }

  const date = new Date(text)
  return text && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : ''
}

function headerIndexes(values) {
  const indexes = {}
  values.forEach((value, index) => {
    const normalized = normalizeHeader(value)
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(normalized) && indexes[field] === undefined) indexes[field] = index
    }
  })
  return indexes
}

async function downloadTemplate() {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Boarders')
  sheet.addRow(HEADERS)
  sheet.getRow(1).font = { bold: true }
  sheet.columns = HEADERS.map((header) => ({ header, width: Math.max(header.length + 3, 20) }))
  sheet.getColumn(2).numFmt = '@'
  sheet.getColumn(5).numFmt = '@'
  sheet.getColumn(6).numFmt = 'yyyy-mm-dd'
  sheet.getColumn(7).numFmt = 'yyyy-mm-dd'
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await workbook.xlsx.writeBuffer()
  const file = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = 'boarder-import-template.xlsx'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function TenantExcelImport({ tenants, onClose, onImport }) {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const readSpreadsheet = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError('')
    setPreview(null)
    setBusy(true)

    try {
      let rows
      if (file.name.toLowerCase().endsWith('.csv')) {
        rows = parseCsv((await file.text()).replace(/^\uFEFF/, ''))
      } else if (file.name.toLowerCase().endsWith('.xlsx')) {
        const ExcelJS = (await import('exceljs')).default
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(await file.arrayBuffer())
        const sheet = workbook.worksheets[0]
        if (!sheet) throw new Error('The workbook does not contain a worksheet.')
        rows = []
        sheet.eachRow({ includeEmpty: false }, (row) => {
          rows.push({
            number: row.number,
            values: row.values.slice(1).map(excelCellValue),
            textValues: row.values.slice(1).map((_, index) => row.getCell(index + 1).text),
          })
        })
      } else {
        throw new Error('Choose an .xlsx or .csv file.')
      }

      const headerRow = rows.find((row) => row.values.some((value) => String(value ?? '').trim()))
      if (!headerRow) throw new Error('The spreadsheet is empty.')
      const indexes = headerIndexes(headerRow.values)
      const missing = REQUIRED_FIELDS.filter((field) => indexes[field] === undefined)
      if (missing.length) {
        throw new Error(`Missing required columns: ${missing.map((field) => HEADERS[Object.keys(HEADER_ALIASES).indexOf(field)]).join(', ')}.`)
      }

      const knownEmails = new Set(tenants.map((tenant) => tenant.email.trim().toLowerCase()))
      const valid = []
      const issues = []

      rows.filter((row) => row.number > headerRow.number).forEach((row) => {
        if (!row.values.some((value) => String(value ?? '').trim())) return
        const record = Object.fromEntries(
          Object.entries(indexes).map(([field, index]) => {
            const value = (field === 'phone' || field === 'emergencyPhone')
              ? row.textValues?.[index] ?? row.values[index]
              : row.values[index]
            return [field, value ?? '']
          }),
        )
        const tenant = {
          name: String(record.name).trim(),
          phone: String(record.phone).trim(),
          email: String(record.email).trim().toLowerCase(),
          emergency: String(record.emergency).trim(),
          emergencyPhone: String(record.emergencyPhone).trim(),
          moveIn: dateToIso(record.moveIn),
          leaseEnd: record.leaseEnd ? dateToIso(record.leaseEnd) : '',
        }
        const missingValues = REQUIRED_FIELDS
          .filter((field) => !tenant[field])
          .map((field) => HEADERS[Object.keys(HEADER_ALIASES).indexOf(field)])
        if (missingValues.length) {
          issues.push({ row: row.number, reason: `Missing ${missingValues.join(', ')}.` })
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tenant.email)) {
          issues.push({ row: row.number, reason: 'Email address is invalid.' })
        } else if (!tenant.moveIn || (record.leaseEnd && !tenant.leaseEnd)) {
          issues.push({ row: row.number, reason: 'Enter dates in a recognizable format.' })
        } else if (knownEmails.has(tenant.email)) {
          issues.push({ row: row.number, reason: 'Email already exists in the boarder list or this file.' })
        } else {
          knownEmails.add(tenant.email)
          valid.push(tenant)
        }
      })

      if (!valid.length && !issues.length) throw new Error('No boarder records were found below the header row.')
      setPreview({ valid, issues })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that spreadsheet.')
    } finally {
      setBusy(false)
    }
  }

  const createTemplate = async () => {
    setError('')
    try {
      await downloadTemplate()
    } catch {
      setError('Could not create the Excel template. Please try again.')
    }
  }

  const importRecords = async () => {
    setBusy(true)
    try {
      await onImport(preview.valid)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not import these boarders.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Import boarders from Excel" onClose={onClose} wide>
      <div className="stack">
        <p className="muted">
          Use the template, fill one boarder per row, and upload the completed .xlsx or .csv file.
          Required columns are full name, mobile number, email, emergency contact name and number, and move-in date.
          Imported boarders start unassigned; assign them to rooms from the Rooms tab.
        </p>
        <div className="toolbar">
          <button type="button" className="btn" onClick={createTemplate}>Download Excel template</button>
          <label className="btn btn-primary">
            {busy ? 'Reading spreadsheet…' : 'Choose spreadsheet'}
            <input
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={readSpreadsheet}
              disabled={busy}
              hidden
            />
          </label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {preview && (
          <>
            <p className="success" role="status">
              {preview.valid.length} ready to import · {preview.issues.length} row{preview.issues.length === 1 ? '' : 's'} need attention.
            </p>
            {preview.valid.length > 0 && (
              <div className="table-wrap import-preview">
                <table>
                  <thead><tr><th>Name</th><th>Email</th><th>Mobile</th></tr></thead>
                  <tbody>
                    {preview.valid.slice(0, 8).map((tenant) => (
                      <tr key={tenant.email}><td>{tenant.name}</td><td>{tenant.email}</td><td>{tenant.phone}</td></tr>
                    ))}
                  </tbody>
                </table>
                {preview.valid.length > 8 && <p className="muted import-note">Showing the first 8 of {preview.valid.length} valid rows.</p>}
              </div>
            )}
            {preview.issues.length > 0 && (
              <ul className="import-issues">
                {preview.issues.slice(0, 10).map((issue) => (
                  <li key={`${issue.row}-${issue.reason}`}>Row {issue.row}: {issue.reason}</li>
                ))}
                {preview.issues.length > 10 && <li>And {preview.issues.length - 10} more rows need attention.</li>}
              </ul>
            )}
            <div className="toolbar">
              <button
                type="button"
                className="btn btn-primary"
                disabled={preview.valid.length === 0 || busy}
                onClick={importRecords}
              >
                {busy ? 'Saving boarders…' : `Import ${preview.valid.length} boarder${preview.valid.length === 1 ? '' : 's'}`}
              </button>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
