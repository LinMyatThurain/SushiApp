"use client"

import type { PointerEvent as ReactPointerEvent } from "react"
import { useCallback, useEffect, useRef } from "react"

type SignaturePadProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  onCancel?: () => void
  onConfirm?: () => void
  confirmDisabled?: boolean
}

type Point = {
  x: number
  y: number
}

export function SignaturePad({ value, onChange, disabled = false, onCancel, onConfirm, confirmDisabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<Point | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const redrawFromValue = useCallback(
    (dataUrl: string) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      const ratio = window.devicePixelRatio || 1
      const nextWidth = Math.max(1, Math.floor(width * ratio))
      const nextHeight = Math.max(1, Math.floor(height * ratio))

      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.strokeStyle = "#0f172a"
      ctx.lineWidth = Math.max(2.5, ratio * 1.25)

      if (!dataUrl) return

      const image = new Image()
      image.onload = () => {
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(image, 0, 0, width, height)
      }
      image.src = dataUrl
    },
    []
  )

  useEffect(() => {
    redrawFromValue(value)

    const canvas = canvasRef.current
    if (!canvas) return

    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = new ResizeObserver(() => redrawFromValue(value))
    resizeObserverRef.current.observe(canvas)

    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
    }
  }, [redrawFromValue, value])

  function getPoint(event: ReactPointerEvent<HTMLCanvasElement>): Point | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  function drawStroke(from: Point, to: Point) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  function commitSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(canvas.toDataURL("image/png"))
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    const point = getPoint(event)
    if (!point) return
    isDrawingRef.current = true
    lastPointRef.current = point
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled || !isDrawingRef.current) return
    const lastPoint = lastPointRef.current
    const point = getPoint(event)
    if (!point || !lastPoint) return
    drawStroke(lastPoint, point)
    lastPointRef.current = point
  }

  function finishStroke() {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    lastPointRef.current = null
    commitSignature()
  }

  function clearSignature() {
    if (disabled) return
    onChange("")
    redrawFromValue("")
  }

  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        className="block h-64 w-full rounded-2xl border border-slate-200 bg-white touch-none sm:h-56"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onPointerLeave={finishStroke}
      />
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-slate-500">Sign with your finger or mouse</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={clearSignature}
            disabled={disabled || !value}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
