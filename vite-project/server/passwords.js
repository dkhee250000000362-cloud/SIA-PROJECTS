import { Buffer } from 'node:buffer'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import bcrypt from 'bcryptjs'

const scrypt = promisify(scryptCallback)
const BCRYPT_ROUNDS = 12

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export function needsPasswordRehash(storedHash) {
  return !String(storedHash).startsWith('$2')
}

export async function verifyPassword(password, storedHash) {
  const hash = String(storedHash)
  if (hash.startsWith('$2')) return bcrypt.compare(password, hash)

  const [saltHex, hashHex] = hash.split(':')
  if (!saltHex || !hashHex || !/^[\da-f]+$/i.test(saltHex) || !/^[\da-f]+$/i.test(hashHex)) return false
  if (hashHex.length !== 128 && hashHex.length !== 127) return false
  const derived = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), 64)).toString('hex')
  const expected = Buffer.from(hashHex, 'ascii')
  const actual = Buffer.from(derived.slice(0, hashHex.length), 'ascii')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function hashLegacyPassword(password) {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, 64)
  return `${salt.toString('hex')}:${Buffer.from(derived).toString('hex')}`
}
