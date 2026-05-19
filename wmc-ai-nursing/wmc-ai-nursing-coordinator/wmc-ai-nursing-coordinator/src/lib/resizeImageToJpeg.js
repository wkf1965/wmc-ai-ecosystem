/**
 * Resize image file and return JPEG data URL for localStorage-safe persistence.
 */
export function resizeImageFileToJpegDataUrl(file, maxWidth = 1280, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Choose an image file.'))
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width)
      canvas.height = Math.round(height)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas not supported.'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      try {
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Could not encode image.'))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image.'))
    }
    img.src = url
  })
}
