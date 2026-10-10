import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X, AudioLines } from 'lucide-react';
import { audioContext, decodeAudio, stopPreview } from './audio/engine';
import type { Role, Sample } from './types';
import { ROLES } from './types';
import { rms } from './audio/dsp';
import { stopMissionVoice } from './voice';
import type { DetectiveCapture } from './detective';

export default function Recorder({ role, quickCapture, onRecordingStart, onClose, onSave }: { role: Role; quickCapture?: DetectiveCapture; onRecordingStart: () => void; onClose: () => void; onSave: (sample: Sample) => Promise<void> }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const [name, setName] = useState('');
  const [captured, setCaptured] = useState<Sample>();
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const stream = useRef<MediaStream | undefined>(undefined);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const animation = useRef<number | undefined>(undefined);
  const input = useRef<MediaStreamAudioSourceNode | undefined>(undefined);
  const duration = quickCapture?.duration ?? 6;
  const roleInfo = ROLES.find(item => item.id === role)!;

  function cleanup() {
    clearInterval(timer.current);
    if (animation.current) cancelAnimationFrame(animation.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    input.current?.disconnect();
  }
  useEffect(() => {
    alive.current = true;
    const before = document.activeElement as HTMLElement | null;
    const dialog = document.getElementById('record-dialog')!;
    dialog.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    const automatic = quickCapture ? setTimeout(() => { void start(); }, 0) : undefined;
    return () => { clearTimeout(automatic); alive.current = false; cleanup(); document.removeEventListener('keydown', key); before?.focus(); };
  }, []);

  async function start() {
    stopMissionVoice(); setError(''); setBusy(true); setCaptured(undefined); onRecordingStart(); stopPreview();
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Recording needs HTTPS or localhost and a browser with microphone support. You can also import an audio file.');
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (!alive.current) { microphone.getTracks().forEach(track => track.stop()); return; }
      stream.current = microphone;
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(value => MediaRecorder.isTypeSupported(value));
      const capture = new MediaRecorder(microphone, type ? { mimeType: type } : undefined);
      recorder.current = capture;
      const chunks: Blob[] = [];
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      capture.onerror = () => { cleanup(); if (alive.current) { setRecording(false); setBusy(false); setError('Recording failed. Try again or import a file.'); } };
      capture.onstop = async () => {
        cleanup();
        if (!alive.current) return;
        setRecording(false); setBusy(true);
        try {
          const audio = await decodeAudio(new Blob(chunks, { type: capture.mimeType }));
          if (!audio.pcm.length || rms(audio.pcm) < 0.0002) throw new Error('That recording was almost silent. Move closer to your sound and try again.');
          if (alive.current) {
            const sample: Sample = { id: crypto.randomUUID(), name: quickCapture?.name ?? roleInfo.title + ' recording', pcm: audio.pcm, sampleRate: audio.sampleRate, createdAt: Date.now(), origin: 'recorded', predictions: [] };
            if (quickCapture) {
              try { await onSave(sample); }
              catch (err) { if (alive.current) { setCaptured(sample); setError(err instanceof Error ? err.message : 'Could not save. Tap Keep this sound to retry.'); } }
            } else setCaptured(sample);
          }
        } catch (err) { if (alive.current) setError(err instanceof Error ? err.message : 'Could not decode that recording.'); }
        finally { if (alive.current) setBusy(false); }
      };
      const ctx = audioContext(); await ctx.resume();
      if (!alive.current) { cleanup(); return; }
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
      input.current = ctx.createMediaStreamSource(microphone); input.current.connect(analyser);
      const values = new Float32Array(analyser.fftSize);
      const meter = () => { analyser.getFloatTimeDomainData(values); setLevel(Math.min(1, rms(values) * 8)); animation.current = requestAnimationFrame(meter); };
      capture.start(); meter(); setSeconds(0); setRecording(true);
      const beginning = performance.now();
      timer.current = setInterval(() => { const elapsed = (performance.now() - beginning) / 1000; setSeconds(elapsed); if (elapsed >= duration) cleanup(); }, 100);
    } catch (err) {
      cleanup();
      if (alive.current) setError(err instanceof DOMException && err.name === 'NotAllowedError' ? 'Microphone access was denied. Allow it in your browser’s site settings, or import an audio file.' : err instanceof Error ? err.message : 'Could not access the microphone.');
    } finally { if (alive.current) setBusy(false); }
  }

  return <div className="modal-backdrop" onClick={onClose}>
    <section id="record-dialog" className="record-dialog" role="dialog" aria-modal="true" aria-labelledby="record-title" tabIndex={-1} onClick={event => event.stopPropagation()}>
      <button className="icon-button modal-close" aria-label="Close recorder" onClick={onClose}><X size={20} /></button>
      <span className="eyebrow">FIELD RECORDING / {quickCapture ? 'DETECTIVE EVIDENCE' : roleInfo.instrument.toUpperCase()}</span>
      <h2 id="record-title">{quickCapture ? 'Catch your evidence.' : `Find your ${roleInfo.title.toLowerCase()}.`}</h2>
      <p className="muted">{quickCapture?.prompt ?? roleInfo.prompt} {quickCapture ? `This capture saves automatically after ${duration === 3 ? 'three' : 'six'} seconds.` : 'Six seconds is plenty. Then put the phone away.'}</p>
      <div className={'record-orb ' + (recording ? 'active' : '')} style={{ '--level': level } as React.CSSProperties}><AudioLines size={44} strokeWidth={1.5}/></div>
      <div className="record-time">{seconds.toFixed(1)}<span> / {duration.toFixed(1)} sec</span></div>
      {captured && !quickCapture && <label className="field-label">Give your sound a name<input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder={captured.name} maxLength={60}/></label>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="record-actions">
        {recording ? <button className="button primary" onClick={cleanup}><Square size={16} fill="currentColor"/>Stop recording</button> : <button className="button" disabled={busy} onClick={start}><Mic size={17}/>{busy ? 'Working…' : captured ? 'Record again' : 'Start recording'}</button>}
        {captured && <button className="button primary" disabled={busy} onClick={async () => { setBusy(true); try { await onSave({ ...captured, name: name.trim() || captured.name }); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save.'); setBusy(false); } }}>Keep this sound</button>}
      </div>
      <p className="small muted">Your microphone stops when this window closes. No cloud uploads.</p>
    </section>
  </div>;
}
