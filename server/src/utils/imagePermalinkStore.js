const crypto = require("crypto")
const fs = require("fs/promises")
const path = require("path")

const IMAGE_STORAGE_DIR = process.env.IMAGE_STORAGE_DIR
  ? path.resolve(process.env.IMAGE_STORAGE_DIR)
  : path.resolve(__dirname, "../../data/images")

const MIME_EXTENSION_MAP = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/svg+xml": "svg",
}

const DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i

const sanitizeSegment = (value, fallback = "shared") => {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return cleaned || fallback
}

const isImageDataUrl = (value) => {
  return typeof value === "string" && value.trim().startsWith("data:image/")
}

const parseImageDataUrl = (dataUrl) => {
  if (typeof dataUrl !== "string") return null
  const match = dataUrl.match(DATA_URL_PATTERN)
  if (!match) return null

  const mimeType = String(match[1] || "").toLowerCase()
  const base64 = String(match[2] || "").replace(/\s/g, "")
  if (!mimeType || !base64) return null

  let buffer
  try {
    buffer = Buffer.from(base64, "base64")
  } catch {
    return null
  }

  if (!buffer || buffer.length === 0) return null

  const fallbackExt = mimeType.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin"
  const extension = MIME_EXTENSION_MAP[mimeType] || fallbackExt

  return { buffer, mimeType, extension }
}

const storeImageDataUrl = async (dataUrl, context = {}) => {
  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed) return dataUrl

  const eventFolder = sanitizeSegment(context.eventCode || context.eventName, "event")
  const teamName = sanitizeSegment(context.teamNumber, "team")
  const incomingHash = crypto.createHash("sha256").update(parsed.buffer).digest("hex")
  const extension = "png"
  const directoryRelativePath = path.posix.join("pit", eventFolder)
  const directoryAbsolutePath = path.join(IMAGE_STORAGE_DIR, ...directoryRelativePath.split("/"))

  await fs.mkdir(directoryAbsolutePath, { recursive: true })

  // Allocate /team.png, then /team-2.png, /team-3.png, ...
  for (let index = 1; index <= 5000; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`
    const filename = `${teamName}${suffix}.${extension}`
    const relativePath = path.posix.join(directoryRelativePath, filename)
    const absolutePath = path.join(IMAGE_STORAGE_DIR, ...relativePath.split("/"))

    try {
      const existing = await fs.readFile(absolutePath)
      const existingHash = crypto.createHash("sha256").update(existing).digest("hex")
      if (existingHash === incomingHash) {
        return `/${path.posix.join("images", relativePath)}`
      }
      continue
    } catch {
      await fs.writeFile(absolutePath, parsed.buffer)
      return `/${path.posix.join("images", relativePath)}`
    }
  }

  throw new Error(`Could not allocate image filename for ${teamName} in event ${eventFolder}`)
}

const replaceImageDataUrls = async (value, context = {}) => {
  if (typeof value === "string") {
    if (!isImageDataUrl(value)) {
      return value
    }

    try {
      return await storeImageDataUrl(value, context)
    } catch (error) {
      console.warn("Failed to store image data URL as permalink", error)
      return value
    }
  }

  if (Array.isArray(value)) {
    const output = []
    for (let index = 0; index < value.length; index += 1) {
      output.push(
        await replaceImageDataUrls(value[index], {
          ...context,
          path: [...(context.path || []), String(index)],
        })
      )
    }
    return output
  }

  if (value && typeof value === "object") {
    const output = {}
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = await replaceImageDataUrls(nestedValue, {
        ...context,
        path: [...(context.path || []), key],
      })
    }
    return output
  }

  return value
}

module.exports = {
  imageStorageDir: IMAGE_STORAGE_DIR,
  isImageDataUrl,
  replaceImageDataUrls,
}
