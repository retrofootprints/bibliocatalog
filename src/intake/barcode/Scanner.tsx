import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../locales';
import { BarcodeDecoder } from './decoder';
import { isValidBookEan13 } from './isbn';

const FRAME_INTERVAL_MS = 100; // ~10fps throttle, per SPEC §4.1
const DUPLICATE_DEBOUNCE_MS = 3000;

export interface ScannerProps {
  /** Called once per accepted (checksum-valid, debounced) EAN-13. */
  onDecoded: (isbn13: string) => void;
  /** Called when a scanned EAN-13 fails the book-ISBN check (bad checksum or non-978/979 prefix). */
  onInvalid?: (raw: string) => void;
}

export function Scanner({ onDecoded, onInvalid }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<BarcodeDecoder | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const busyRef = useRef(false);
  const frameTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [cameraError, setCameraError] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  useEffect(() => {
    decoderRef.current = new BarcodeDecoder();
    return () => {
      stopCamera();
      decoderRef.current?.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    setCameraError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const capabilities = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorchSupported(!!capabilities?.torch);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      scheduleNextFrame();
    } catch {
      setCameraError(true);
      setCameraActive(false);
    }
  }

  function stopCamera() {
    if (frameTimerRef.current) {
      window.clearTimeout(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    trackRef.current = null;
    setCameraActive(false);
    setTorchOn(false);
  }

  function scheduleNextFrame() {
    frameTimerRef.current = window.setTimeout(captureFrame, FRAME_INTERVAL_MS);
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || busyRef.current || !decoderRef.current) {
      scheduleNextFrame();
      return;
    }
    busyRef.current = true;
    try {
      const bitmap = await createImageBitmap(video);
      const results = await decoderRef.current.decodeBitmap(bitmap);
      if (results.length > 0) {
        handleCode(results[0].text);
      }
    } catch {
      // Transient decode failure; keep scanning.
    } finally {
      busyRef.current = false;
      if (streamRef.current) scheduleNextFrame();
    }
  }

  function handleCode(raw: string) {
    const now = Date.now();
    const last = lastCodeRef.current;
    if (last && last.code === raw && now - last.at < DUPLICATE_DEBOUNCE_MS) {
      return; // debounce duplicate
    }
    lastCodeRef.current = { code: raw, at: now };

    if (!isValidBookEan13(raw)) {
      onInvalid?.(raw);
      return;
    }

    confirmScan();
    setSessionCount((c) => c + 1);
    setLastScanned(raw);
    onDecoded(raw);
  }

  function confirmScan() {
    if (navigator.vibrate) navigator.vibrate(60);
    try {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      audioCtxRef.current ??= new AudioCtx();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // Audio confirmation is a nicety; ignore failures (e.g. autoplay policy).
    }
  }

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    try {
      const next = !torchOn;
      // `torch` is not yet part of the TS DOM lib's MediaTrackConstraintSet.
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  async function handleFileUpload(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !decoderRef.current) return;
    try {
      const results = await decoderRef.current.decodeBlob(file);
      if (results.length > 0) {
        handleCode(results[0].text);
      } else {
        onInvalid?.('');
      }
    } finally {
      input.value = '';
    }
  }

  return (
    <div class="scanner">
      {cameraActive && (
        <div class="scanner__viewport">
          <video ref={videoRef} class="scanner__video" playsInline muted />
          <div class="scanner__frame" />
        </div>
      )}

      {!cameraActive && (
        <div class="scanner__idle">
          {cameraError && <p class="scanner__error">{t('scan.cameraDenied')}</p>}
          <button type="button" class="btn btn--primary" onClick={startCamera}>
            {t('scan.startCamera')}
          </button>
        </div>
      )}

      <div class="scanner__controls">
        {cameraActive && (
          <button type="button" class="btn" onClick={stopCamera}>
            {t('scan.stopCamera')}
          </button>
        )}
        {cameraActive && torchSupported && (
          <button type="button" class={`btn ${torchOn ? 'btn--active' : ''}`} onClick={toggleTorch}>
            {t('scan.torch')}
          </button>
        )}
      </div>

      <div class="scanner__upload">
        <label class="btn btn--secondary">
          {t('scan.uploadInstead')}
          <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} hidden />
        </label>
      </div>

      <p class="scanner__status">{t('scan.sessionCount', { count: sessionCount })}</p>
      {lastScanned && <p class="scanner__status scanner__status--muted">{t('scan.lastScanned', { isbn: lastScanned })}</p>}
    </div>
  );
}
