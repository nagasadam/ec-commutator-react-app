import { useEffect, useId, useRef, useState } from 'react'

export function Camera({ onText }) {
  const video = useRef(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    let stop = false
    let stream
    let timer
    ;(async () => {
      if (!('BarcodeDetector' in window)) return setMsg('This phone’s browser cannot read QR codes in the page. Type the code printed under the QR instead.')
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stop) return stream.getTracks().forEach((t) => t.stop())
        video.current.srcObject = stream
        await video.current.play()
        const det = new window.BarcodeDetector({ formats: ['qr_code'] })
        const tick = async () => {
          if (stop) return
          try {
            const r = await det.detect(video.current)
            if (r[0]?.rawValue) return onText(r[0].rawValue)
          } catch {
            /* a frame that cannot be read: try the next one */
          }
          timer = setTimeout(tick, 250)
        }
        tick()
      } catch {
        setMsg('The camera is not available. Allow camera access, or type the code printed under the QR.')
      }
    })()
    return () => {
      stop = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="cam">
      <video ref={video} playsInline muted aria-label="Camera view for scanning a QR code" />
      <div className="reticle" />
      {msg && <p className="note" role="status">{msg}</p>}
    </div>
  )
}

export function Stepper({ label, value, set, step = 1, big }) {
  const v = Number(value) || 0
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper" role="group" aria-label={label}>
        <button type="button" onClick={() => set(String(Math.max(0, v - step)))} aria-label={`Decrease ${label}`}>−</button>
        <input id={id} inputMode="decimal" value={value} placeholder="0" onChange={(e) => set(e.target.value.replace(/[^0-9.]/g, ''))} className={big ? 'big' : ''} />
        <button type="button" onClick={() => set(String(v + step))} aria-label={`Increase ${label}`}>+</button>
      </div>
    </div>
  )
}

// ---- the scan flow --------------------------------------------------------------------------------------
