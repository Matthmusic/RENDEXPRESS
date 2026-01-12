/**
 * Gofile.io Upload Handler
 * Handles automatic file uploads to Gofile.io with progress tracking
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')

/**
 * Get the best Gofile server for upload
 */
async function getGofileServer() {
  const fallbackServer = 'store1'

  const pickServer = (json) => {
    if (!json || json.status !== 'ok') return null
    if (json.data?.servers?.length) return json.data.servers[0].name
    if (json.data?.serversAllZone?.length) return json.data.serversAllZone[0].name
    if (json.data?.server) return json.data.server
    return null
  }

  return new Promise((resolve, reject) => {
    console.log('[Gofile] Fetching best server from API...')
    const req = https.get('https://api.gofile.io/servers', (res) => {
      console.log('[Gofile] Response status:', res.statusCode)
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        console.log('[Gofile] Raw response:', data)
        try {
          const json = JSON.parse(data)
          console.log('[Gofile] Parsed response:', json)

          const serverName = pickServer(json)
          if (serverName) {
            console.log('[Gofile] Server selected:', serverName)
            resolve(serverName)
            return
          }

          console.error('[Gofile] API error:', json)
          reject(new Error(json?.error || 'Failed to get server'))
        } catch (err) {
          console.error('[Gofile] Parse error:', err)
          reject(err)
        }
      })
    })

    req.on('error', (err) => {
      console.error('[Gofile] Request error:', err)
      reject(err)
    })

    req.setTimeout(8000, () => {
      req.destroy(new Error('Server request timeout'))
    })
  }).catch((err) => {
    console.error('[Gofile] Falling back to default server:', fallbackServer, err?.message || err)
    return fallbackServer
  })
}

/**
 * Upload file to Gofile with progress tracking
 * @param {string} filePath - Path to the file to upload
 * @param {function} onProgress - Progress callback
 */
async function uploadToGofile(filePath, onProgress) {
  // Get best server
  const server = await getGofileServer()

  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filePath)
    const totalSize = stat.size
    const fileName = path.basename(filePath)

    // Create multipart form data boundary
    const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`

    // Prepare form data header
    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: application/zip\r\n\r\n`,
      'utf8'
    )

    // Prepare form data footer
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')

    const contentLength = header.length + totalSize + footer.length

    // Prepare request options
    const options = {
      hostname: `${server}.gofile.io`,
      port: 443,
      path: '/contents/uploadfile',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': contentLength
      }
    }

    onProgress?.({
      phase: 'preparing',
      loaded: 0,
      total: totalSize,
      percentage: 0
    })

    const req = https.request(options, (res) => {
      let responseData = ''

      res.on('data', (chunk) => {
        responseData += chunk
      })

      res.on('end', () => {
        try {
          const json = JSON.parse(responseData)

          if (json.status === 'ok' && json.data?.downloadPage) {
            resolve({
              success: true,
              downloadUrl: json.data.downloadPage,
              fileId: json.data.fileId
            })
          } else {
            reject(new Error(json.error || 'Upload failed'))
          }
        } catch (err) {
          reject(new Error(`Failed to parse response: ${err.message}`))
        }
      })
    })

    req.on('error', (err) => {
      reject(new Error(`Upload error: ${err.message}`))
    })

    // Write header
    req.write(header)

    // Stream file with progress tracking
    const fileStream = fs.createReadStream(filePath)
    let uploadedBytes = 0

    fileStream.on('data', (chunk) => {
      uploadedBytes += chunk.length
      const percentage = Math.round((uploadedBytes / totalSize) * 100)

      onProgress?.({
        phase: 'uploading',
        loaded: uploadedBytes,
        total: totalSize,
        percentage
      })

      req.write(chunk)
    })

    fileStream.on('end', () => {
      onProgress?.({
        phase: 'finalizing',
        loaded: totalSize,
        total: totalSize,
        percentage: 100
      })

      // Write footer and end request
      req.write(footer)
      req.end()
    })

    fileStream.on('error', (err) => {
      reject(new Error(`File read error: ${err.message}`))
    })
  })
}

module.exports = {
  getGofileServer,
  uploadToGofile
}
