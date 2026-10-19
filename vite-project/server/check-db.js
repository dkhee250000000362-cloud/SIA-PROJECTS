import 'dotenv/config'
import process from 'node:process'
import mysql from 'mysql2/promise'

const database = process.env.MYSQL_DATABASE || 'boarding_house'
const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database,
})

try {
  const [tables] = await connection.execute(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
    [database],
  )
  const tableNames = new Set(tables.map((table) => table.TABLE_NAME))
  console.log(`Connected to MySQL database "${database}".`)
  console.log(`Tables: ${[...tableNames].join(', ')}`)

  if (!tableNames.has('workspace_state')) {
    throw new Error('workspace_state is missing. Start the app once to initialize its tables.')
  }

  const [rows] = await connection.execute(
    `SELECT version, updated_at,
      JSON_LENGTH(workspace_data, ?) AS rooms,
      JSON_LENGTH(workspace_data, ?) AS tenants,
      JSON_LENGTH(workspace_data, ?) AS bills,
      JSON_LENGTH(workspace_data, ?) AS tickets
     FROM workspace_state WHERE id = ?`,
    ['$.rooms', '$.tenants', '$.bills', '$.tickets', 1],
  )
  if (!rows.length) throw new Error('workspace_state has no workspace row.')
  const workspace = rows[0]
  console.log(`Workspace last updated: ${workspace.updated_at}`)
  console.log(`Workspace version: ${workspace.version}`)
  console.log(`Rooms: ${workspace.rooms}; boarders: ${workspace.tenants}; bills: ${workspace.bills}; repair requests: ${workspace.tickets}`)
} finally {
  await connection.end()
}
