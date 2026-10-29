import { useEffect, useRef, useState } from 'react'

// Разширението, което платформата приема за всеки запис (WebM, Ogg, MP3, WAV, M4A, AAC).
const EXTENSIONS: [string, string][] = [
  ['webm', 'webm'],
  ['ogg', 'ogg'],
  ['mp4', 'm4a'],
  ['aac', 'aac'],
  ['mpeg', 'mp3'],
  ['wav', 'wav'],
]

export function voiceFilename(mime: string): string {
  const match = EXTENSIONS.find(([part]) => mime.includes(part))
  return `voice.${match ? match[1] : 'webm'}`
}

/** Запис от микрофона; onDone получава записа, когато човек натисне стоп. */
export function useVoiceNote(onDone: (voice: Blob, filename: string) => void) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)

  useEffect(() => () => recorder.current?.stream.getTracks().forEach((track) => track.stop()), [])

  async function start() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const next = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      next.ondataavailable = (event) => chunks.push(event.data)
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const voice = new Blob(chunks, { type: next.mimeType })
        if (voice.size) onDone(voice, voiceFilename(next.mimeType))
      }
      next.start()
      recorder.current = next
      setRecording(true)
    } catch {
      setError('Няма достъп до микрофона.')
    }
  }

  function stop() {
    recorder.current?.stop()
    recorder.current = null
    setRecording(false)
  }

  return { recording, error, start, stop }
}
