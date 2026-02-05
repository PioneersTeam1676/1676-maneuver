const crypto = require("crypto")

const getSecretKey = () => {
  const secret = process.env.FORM_DB_SECRET || process.env.APP_SECRET
  if (!secret) {
    throw new Error("FORM_DB_SECRET is not configured")
  }
  return crypto.createHash("sha256").update(secret).digest()
}

const encryptSecret = (value) => {
  if (!value) return null
  const key = getSecretKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

const decryptSecret = (value) => {
  if (!value) return null
  const raw = String(value)
  if (!raw.startsWith("enc:v1:")) {
    return raw
  }
  const [, , ivB64, tagB64, dataB64] = raw.split(":")
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted secret payload")
  }
  const key = getSecretKey()
  const iv = Buffer.from(ivB64, "base64")
  const tag = Buffer.from(tagB64, "base64")
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ])
  return decrypted.toString("utf8")
}

module.exports = {
  encryptSecret,
  decryptSecret,
}
