import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto"
import { promisify } from "util"

const scrypt = promisify(scryptCallback)

const KEY_LENGTH = 64
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16).toString("hex")
	const derived = (await scrypt(password, salt, KEY_LENGTH, {
		N: SCRYPT_N,
		r: SCRYPT_R,
		p: SCRYPT_P,
	})) as Buffer

	return `${salt}:${derived.toString("hex")}`
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
	const [salt, hashHex] = storedHash.split(":")
	if (!salt || !hashHex) {
		return false
	}

	const expected = Buffer.from(hashHex, "hex")
	const actual = (await scrypt(password, salt, expected.length, {
		N: SCRYPT_N,
		r: SCRYPT_R,
		p: SCRYPT_P,
	})) as Buffer

	if (expected.length !== actual.length) {
		return false
	}

	return timingSafeEqual(expected, actual)
}
