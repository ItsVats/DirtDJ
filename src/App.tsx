import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Library, Disc3, AudioLines, ArrowUpRight, BrainCircuit, Check, Download, Headphones, Leaf, LoaderCircle, Mic, Play, Plus, ShieldCheck, Shuffle, Sprout, Square, Trash2, Upload, Volume2, VolumeX, X } from 'lucide-react';
import type { Project, Role, Sample } from './types';
import { newProject, ROLES } from './types';
import { decodeAudio, exportBeat, playBeat, updateBeat, previewSample, stopBeat, stopPreview } from './audio/engine';
import { rms, suggestRole, waveform } from './audio/dsp';
import { classifySample, warmModel } from './ai/client';
import { deleteSample, loadProject, loadSamples, saveProject, saveSample } from './storage/db';
import { offlineAvailable, prepareOffline, registerOffline } from './offline';
import Recorder from './Recorder';
import SoundDetective from './SoundDetective';
import type { DetectiveCapture } from './detective';
import { downloadOrShare, nativeApp } from './mobile';

function Wave({ sample, color = 'currentColor' }: { sample: Sample; color?: string }) {
  const values = waveform(sample.pcm);
  return <svg className="waveform" viewBox="0 0 256 42" aria-hidden="true">{values.map((value, index) => <rect key={index} x={index * 4} y={21 - Math.max(1.5, value * 20)} width="2" height={Math.max(3, value * 40)} rx="1" fill={color}/>)}</svg>;
}

export default function App() {
  const [mobile, setMobile] = useState(() => nativeApp() || window.matchMedia('(max-width: 760px)').matches);
  const [screen, setScreen] = useState<'hunt' | 'kit' | 'deck' | 'sounds'>('hunt');
  const [deckLane, setDeckLane] = useState(0);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const change = () => setMobile(nativeApp() || query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  function navigate(next: typeof screen) {
    setScreen(next); stopPreview(); setPreviewId(undefined);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const [project, setProject] = useState<Project>(newProject);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [recordRole, setRecordRole] = useState<Role>();
  const [fieldCapture, setFieldCapture] = useState<DetectiveCapture>();
  const [busyId, setBusyId] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [step, setStep] = useState(-1);
  const [exporting, setExporting] = useState(false);
  const [offline, setOffline] = useState(false);
  const [packProgress, setPackProgress] = useState<number>();
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [previewId, setPreviewId] = useState<string>();
  const [aiReady, setAiReady] = useState(false);
  const [tempoDraft, setTempoDraft] = useState('86');
  const animation = useRef<number | undefined>(undefined);
  const playbackGeneration = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const importRole = useRef<Role>('thump');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const projectRef = useRef({ project, samples });
  projectRef.current = { project, samples };
  const sampleCount = project.tracks.filter(track => samples.some(sample => sample.id === track.sampleId)).length;
  const busy = Boolean(busyId || importing || packProgress !== undefined);

  const tell = useCallback((text: string, error = false) => { clearTimeout(noticeTimer.current); setNotice({ text, error }); noticeTimer.current = setTimeout(() => setNotice(undefined), error ? 15000 : 6000); }, []);
  const stop = useCallback(() => { playbackGeneration.current++; stopBeat(); setPlaying(false); setRendering(false); setStep(-1); if (animation.current) cancelAnimationFrame(animation.current); }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([loadSamples(), loadProject()]).then(([stored, saved]) => {
      if (!alive) return;
      setSamples(stored);
      if (saved) setProject({ bpm: saved.bpm, swing: saved.swing, tracks: saved.tracks.map(track => ({ ...track, sampleId: stored.some(sample => sample.id === track.sampleId) ? track.sampleId : null })) });
      setLoaded(true);
    }).catch(() => { if (alive) { setLoaded(true); tell('Browser storage is unavailable. Your session will work, but recordings may not survive a reload.', true); } });
    registerOffline().then(() => offlineAvailable()).then(ready => { if (alive) setOffline(ready); }).catch(() => {});
    const controller = () => { offlineAvailable().then(ready => { if (alive) setOffline(ready); }); };
    navigator.serviceWorker?.addEventListener('controllerchange', controller);
    return () => { alive = false; stopBeat(); stopPreview(); clearTimeout(noticeTimer.current); clearTimeout(previewTimer.current); if (animation.current) cancelAnimationFrame(animation.current); navigator.serviceWorker?.removeEventListener('controllerchange', controller); };
  }, [tell]);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => { saveProject(project).catch(() => tell('Could not save the beat. Browser storage may be full.', true)); }, 250);
    return () => clearTimeout(timer);
  }, [project, loaded, tell]);

  // Keep the current bar intact; the transport applies edits on the next bar.
  useEffect(() => { updateBeat(project, samples); }, [project, samples]);
  useEffect(() => { setTempoDraft(String(project.bpm)); }, [project.bpm]);

  function changeTrack(index: number, patch: Partial<Project['tracks'][number]>) {
    setProject(current => ({ ...current, tracks: current.tracks.map((track, i) => i === index ? { ...track, ...patch } : track) }));
  }

  async function analyze(sample: Sample) {
    setBusyId(sample.id);
    try {
      const predictions = await classifySample(sample);
      setAiReady(true);
      const updated = { ...sample, predictions, suggestedRole: suggestRole(predictions) };
      await saveSample(updated);
      setSamples(current => current.map(item => item.id === updated.id ? updated : item));
      tell(`AI heard: ${predictions[0]?.label ?? 'no confident match'}. You can use this sound in any lane.`);
      return updated;
    } catch (err) {
      tell(`Your recording is kept. AI could not label it: ${err instanceof Error ? err.message : 'unknown error'}`, true);
    } finally { setBusyId(undefined); }
  }

  async function keep(sample: Sample, role: Role) {
    await saveSample(sample);
    setSamples(current => [...current, sample]);
    setProject(current => ({ ...current, tracks: current.tracks.map(track => track.role === role ? { ...track, sampleId: sample.id } : track) }));
    setRecordRole(undefined);
    tell('Sound saved on this device. The local model is listening…');
    void analyze(sample);
  }

  async function importAudio(file?: File) {
    if (!file) return;
    setImporting(true);
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('Please use a file smaller than 30 MB. A few seconds is enough.');
      const { pcm, sampleRate, truncated } = await decodeAudio(file);
      if (!pcm.length || rms(pcm) < 0.0002) throw new Error('That file is almost silent. Try a louder recording.');
      await keep({ id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), pcm, sampleRate, createdAt: Date.now(), origin: 'imported', predictions: [] }, importRole.current);
      if (truncated) tell('Imported the first 10 seconds. The original file stays unchanged. AI is listening…');
    } catch (err) { tell(err instanceof Error ? err.message : 'That audio format could not be read. Try WAV, MP3, M4A, or WebM.', true); }
    finally { setImporting(false); if (fileInput.current) fileInput.current.value = ''; }
  }

  async function togglePlay(at?: number) {
    if ((playing || rendering) && !at) { stop(); return; }
    if (at) stop();
    stopPreview(); setPreviewId(undefined); setRendering(true);
    const generation = ++playbackGeneration.current;
    try {
      const playback = await playBeat(project, samples, at);
      updateBeat(projectRef.current.project, projectRef.current.samples);
      if (generation !== playbackGeneration.current) { stopBeat(); return; }
      setRendering(false); setPlaying(true);
      const tick = () => { setStep(playback.position().step); animation.current = requestAnimationFrame(tick); };
      tick();
    } catch { if (generation === playbackGeneration.current) { setRendering(false); tell('Audio could not start. Try pressing play again.', true); } }
  }
  async function listen(sample: Sample) {
    if (previewId === sample.id) { stopPreview(); setPreviewId(undefined); clearTimeout(previewTimer.current); return; }
    clearTimeout(previewTimer.current);
    try { await previewSample(sample); setPreviewId(sample.id); previewTimer.current = setTimeout(() => setPreviewId(undefined), sample.pcm.length / sample.sampleRate * 1000); }
    catch { tell('Could not play that sound.', true); }
  }

  async function download() {
    setExporting(true);
    try {
      const blob = await exportBeat(project, samples);
      await downloadOrShare(blob, `dirtdj-${project.bpm}bpm-${new Date().toISOString().slice(0, 10)}.wav`);
      tell('Four bars exported as WAV. Made entirely on your device.');
    } catch { tell('Could not export this beat. Try again with fewer sounds.', true); }
    finally { setExporting(false); }
  }

  async function installPack() {
    setPackProgress(0);
    try {
      await prepareOffline(setPackProgress);
      tell('Offline files saved. Checking the local AI runtime…');
      await warmModel(); setAiReady(true); setOffline(true);
      tell('Offline pack ready. Try airplane mode, reload, then import or record a sound.');
    } catch (err) { tell(err instanceof Error ? err.message : 'Offline setup failed. Please try again.', true); }
    finally { setPackProgress(undefined); }
  }

  async function remove(sample: Sample) {
    try {
      await deleteSample(sample.id);
      if (previewId === sample.id) { stopPreview(); setPreviewId(undefined); }
      setSamples(current => current.filter(item => item.id !== sample.id));
      setProject(current => ({ ...current, tracks: current.tracks.map(track => track.sampleId === sample.id ? { ...track, sampleId: null } : track) }));
      tell('Sound deleted from this device.');
    } catch { tell('Could not delete that sound.', true); }
  }

  function commitTempo() {
    const value = Number(tempoDraft);
    const bpm = tempoDraft.trim() && Number.isFinite(value) ? Math.max(50, Math.min(160, Math.round(value))) : project.bpm;
    setTempoDraft(String(bpm));
    setProject(current => ({ ...current, bpm }));
  }

  function remix() {
    const patterns = [
      [[0, 6, 8, 10], [4, 12], [0, 2, 6, 8, 10, 14], [3, 11]],
      [[0, 7, 10], [4, 12, 15], [2, 5, 6, 10, 13, 14], [1, 9]],
      [[0, 8], [4, 11, 12], [2, 6, 10, 14, 15], [7, 15]],
    ];
    const selection = patterns[Math.floor(Math.random() * patterns.length)];
    setProject(current => ({ ...current, tracks: current.tracks.map((track, index) => ({ ...track, steps: Array.from({ length: 16 }, (_, i) => selection[index].includes(i)) })) }));
  }

  return <div className="app-shell" data-mobile={mobile}>
    <header className="topbar"><button className="brand" onClick={() => navigate('hunt')} aria-label="Dirt DJ home"><span className="brand-mark"><Headphones size={23}/><Sprout size={13}/></span>DIRT<span>DJ</span></button>{!offline && <button className="text-button offline-setup" onClick={installPack} disabled={busy} aria-label="Prepare offline pack">{packProgress !== undefined ? <><LoaderCircle className="spin" size={14}/>{Math.round(packProgress * 100)}% · Setting up</> : 'Prepare offline'}</button>}</header>
    <main>
      <section className="hero" hidden={mobile}><div className="hero-copy"><span className="eyebrow"><span className="tiny-line"/> A FIELD TRIP FOR YOUR EARS</span><h1>The outdoors<br/>is your <span className="instrument-word">instrument.<svg viewBox="0 0 480 15" preserveAspectRatio="none" aria-hidden="true"><path d="M3 9Q200 0 475 6M18 13Q240 5 460 10"/></svg></span></h1><p>Follow a clue. Discover a hidden sound.<br/>Or collect your own sounds and make a beat.</p><div className="hero-actions"><button className="button primary" disabled={!loaded || busy} onClick={() => { setRecordRole(ROLES.find(role => !project.tracks.find(track => track.role === role.id)?.sampleId)?.id ?? 'thump'); }}><Mic size={17}/>Collect a sound</button></div></div><div className="hero-art" aria-hidden="true"><span className="art-caption">SIDE A / THE GREAT OUTDOORS</span><div className="record-sleeve"><div className={'vinyl ' + (playing ? 'rotating' : '')}><div className="vinyl-label"><div className="label-sky"><span className="sun"/><span className="hill back"/><span className="hill front"/><span className="grass g1"/><span className="grass g2"/><span className="grass g3"/></div><span className="vinyl-text">DIRT DJ<br/><small>FIELD RECORDINGS · VOL. 01</small></span><span className="spindle"/></div></div></div><span className="art-handwritten">Sounds better out there.</span><AudioLines className="art-wave" size={46} strokeWidth={1}/></div></section>

      <div hidden={mobile && screen !== 'hunt'} className="hunt-screen">
        {mobile && <div className="mobile-welcome"><span className="eyebrow">A FIELD TRIP FOR YOUR EARS</span><h1>Follow your ears.</h1><p>One clue. A few seconds. Back outside.</p></div>}
      <SoundDetective disabled={busy || !loaded} samplesLoaded={loaded} samples={samples} busyId={busyId} onSearch={() => { stop(); stopPreview(); setPreviewId(undefined); }} onAnalyze={analyze} onCapture={request => { setFieldCapture(request); setRecordRole('thump'); }}/></div>

      <section className="field-kit" hidden={mobile && screen !== 'kit'}><div className="section-heading"><div><span className="eyebrow">01 / COLLECT</span><h2>Your field kit<span className="count-tag">{sampleCount} / 4 sounds</span></h2></div><p>Four ingredients. Infinite little possibilities.</p></div><div className="kit-grid">{ROLES.map((role, index) => {
        const sample = samples.find(item => item.id === project.tracks[index]?.sampleId);
        return <article key={role.id} className={'kit-card ' + (sample ? 'filled' : '')} style={{ '--lane-color': role.color } as React.CSSProperties}><div className="kit-top"><span className="lane-number">0{index + 1}</span><span className="instrument-tag">{role.instrument}</span>{sample && <Check size={16}/>}</div><h3>{role.title}</h3><p>{role.prompt}</p><div className="kit-sound">{sample ? <><button className="sample-preview" onClick={() => listen(sample)} aria-label={`Preview ${sample.name}`}><Wave sample={sample} color={role.color}/><span>{previewId === sample.id ? <Square size={12}/> : <Play size={12}/>}<span>{sample.name}</span></span></button><span className="sound-type">{busyId === sample.id ? 'Local AI is listening…' : sample.origin === 'demo' ? 'Synthesized demo sound' : sample.predictions[0] ? `AI suggestion: ${sample.predictions[0].label}` : 'Your field recording'}</span></> : <div className="empty-wave"><AudioLines size={44} strokeWidth={1}/><span>Find your sound</span></div>}</div><div className="kit-actions"><button className="button small-button" disabled={busy || !loaded} onClick={() => { setRecordRole(role.id); }}><Mic size={14}/>{sample ? 'Record another' : 'Record'}</button><button className="icon-button" disabled={busy || !loaded} aria-label={`Import audio for ${role.title}`} title="Import an audio file" onClick={() => { importRole.current = role.id; fileInput.current?.click(); }}><Upload size={16}/></button></div></article>;
      })}</div></section>

      <section className="studio-panel" hidden={mobile && screen !== 'deck'}><div className="section-heading"><div><span className="eyebrow">02 / MAKE SOME MUSIC</span><h2>The dirt deck</h2></div><span className="deck-status"><span className={'status-dot ' + (playing ? 'playing-dot' : '')}/>{playing ? 'Playing your loop' : '16 steps · 1 bar · all yours'}</span></div><div className="deck-controls"><div className="transport"><button className={'play-button ' + (playing ? 'is-playing' : '')} disabled={!sampleCount && !playing && !rendering} onClick={() => togglePlay()} aria-label={playing || rendering ? 'Stop beat' : 'Play beat'}>{rendering ? <LoaderCircle className="spin" size={20}/> : playing ? <Square size={17} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}</button><label className="tempo-label">TEMPO<div><input type="number" aria-label="Tempo in BPM" min={50} max={160} value={tempoDraft} onChange={event => { setTempoDraft(event.target.value); const value = Number(event.target.value); if (event.target.value && Number.isInteger(value) && value >= 50 && value <= 160) setProject(current => ({ ...current, bpm: value })); }} onBlur={commitTempo} onKeyDown={event => { if (event.key === 'Enter') { commitTempo(); event.currentTarget.blur(); } }}/><span>BPM</span></div></label><span className="control-divider"/><label className="swing-label">SWING <span>{Math.round(project.swing * 100)}%</span><input type="range" aria-label="Swing" min={0} max={100} value={project.swing * 100} onChange={event => setProject(current => ({ ...current, swing: Number(event.target.value) / 100 }))}/></label></div><div className="deck-actions"><button className="button small-button" onClick={remix}><Shuffle size={15}/>New groove</button><button className="button dark small-button" disabled={!sampleCount || exporting} onClick={download}>{exporting ? <LoaderCircle className="spin" size={15}/> : <Download size={15}/>}Export WAV</button></div></div>
      {mobile && <div className="mobile-lanes" role="group" aria-label="Deck lanes">{ROLES.map((role, index) => <button key={role.id} aria-pressed={deckLane === index} onClick={() => setDeckLane(index)} style={{ '--lane-color': role.color } as React.CSSProperties}>{role.title}</button>)}</div>}
      <div className="sequencer-scroll"><div className="sequencer"><div className="beat-ruler"><span>YOUR SOUNDS</span><div>{Array.from({ length: 16 }, (_, i) => <span key={i}>{i % 4 === 0 ? i / 4 + 1 : '·'}</span>)}</div><span>LEVEL</span></div>{project.tracks.map((track, index) => {
        const role = ROLES[index];
        return <div hidden={mobile && deckLane !== index} className={'track-row ' + (track.muted ? 'muted-track' : '')} key={track.role} style={{ '--lane-color': role.color } as React.CSSProperties}><div className="track-info"><button className="icon-button mute-button" aria-label={`${track.muted ? 'Unmute' : 'Mute'} ${role.title}`} onClick={() => changeTrack(index, { muted: !track.muted })}>{track.muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}</button><div><strong>{role.title}</strong><select aria-label={`Sound for ${role.title}`} value={track.sampleId ?? ''} onChange={event => changeTrack(index, { sampleId: event.target.value || null })}><option value="">Choose a sound</option>{samples.map(sample => <option key={sample.id} value={sample.id}>{sample.name}</option>)}</select></div></div><div className="step-grid">{track.steps.map((active, position) => <button key={position} className={'step ' + (active ? 'step-on ' : '') + (step === position ? 'current-step ' : '') + (position % 4 === 0 ? 'beat-start' : '')} aria-label={`${role.title} step ${position + 1}`} aria-pressed={active} onClick={() => changeTrack(index, { steps: track.steps.map((value, i) => i === position ? !value : value) })}><span/><small className="step-number">{position + 1}</small></button>)}</div><input className="lane-level" type="range" aria-label={`${role.title} volume`} min={0} max={100} value={track.volume * 100} onChange={event => changeTrack(index, { volume: Number(event.target.value) / 100 })}/></div>;
      })}</div></div><div className="deck-footer"><span><Plus size={12}/>Edits join in on the next loop.</span><span>{loaded ? 'Changes saved on this device' : 'Loading your session…'}<ShieldCheck size={13}/></span></div></section>

      <section className="collection-section" hidden={mobile && screen !== 'sounds'}><div className="section-heading"><div><span className="eyebrow">03 / YOUR LITTLE SOUND WORLD</span><h2>Field notes<span className="count-tag">{samples.length} sounds</span></h2></div><span className="small muted"><BrainCircuit size={14}/>{aiReady ? 'Local AI loaded' : 'AI loads when you need it'}</span></div>{samples.length === 0 ? <div className="empty-collection"><Leaf size={28} strokeWidth={1.3}/><div><h3>Nothing here yet. That’s your cue.</h3><p>The best samples are waiting on the other side of the door.</p></div><button className="text-button" onClick={() => setRecordRole('thump')} disabled={!loaded || busy}>Go find a sound<ArrowUpRight size={15}/></button></div> : <div className="sample-list">{samples.map(sample => <article className="sample-row" key={sample.id}><button className={'sample-play icon-button ' + (previewId === sample.id ? 'preview-active' : '')} aria-label={`Listen to ${sample.name}`} onClick={() => listen(sample)}>{previewId === sample.id ? <Square size={15}/> : <Play size={15}/>}</button><div className="sample-details"><h3>{sample.name}<span>{(sample.pcm.length / sample.sampleRate).toFixed(1)}s</span></h3><span className="sound-type">{sample.origin === 'demo' ? 'SYNTHESIZED DEMO' : sample.origin === 'recorded' ? 'RECORDED ON THIS DEVICE' : 'IMPORTED AUDIO'}{sample.suggestedRole && ` · TRY AS ${sample.suggestedRole.toUpperCase()}`}</span></div><div className="library-wave"><Wave sample={sample}/></div><div className="predictions">{sample.predictions.length ? sample.predictions.map((prediction, i) => <span key={prediction.label} className={i === 0 ? 'top-prediction' : ''} title="Model score, not a guaranteed identification">{prediction.label}<small>{Math.round(prediction.score * 100)}%</small></span>) : <span className="unclassified">{busyId === sample.id ? 'Listening on your device…' : sample.origin === 'demo' ? 'No AI labels generated' : 'Not labeled yet'}</span>}</div><button className="icon-button ai-listen" disabled={busy} aria-label={`Analyze ${sample.name} with local AI`} title="Analyze with local AI" onClick={() => analyze(sample)}>{busyId === sample.id ? <LoaderCircle size={17} className="spin"/> : <BrainCircuit size={17}/>}</button><button className="icon-button delete-button" aria-label={`Delete ${sample.name}`} disabled={busyId === sample.id} onClick={() => remove(sample)}><Trash2 size={16}/></button></article>)}</div>}</section>
    </main>
    {mobile && <nav className="mobile-nav" aria-label="Main navigation">{([
      ['hunt', 'Hunt', Search], ['kit', 'Kit', Mic], ['deck', 'Deck', Disc3], ['sounds', 'Sounds', Library],
    ] as const).map(([id, label, Icon]) => <button key={id} aria-label={label} aria-current={screen === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={22}/><span>{label}</span>{id === 'deck' && playing && <i aria-hidden="true"/>}</button>)}</nav>}
    <input ref={fileInput} type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm" hidden onChange={event => importAudio(event.target.files?.[0])}/>
    {recordRole && <Recorder role={recordRole} quickCapture={fieldCapture} onRecordingStart={stop} onClose={() => { setRecordRole(undefined); setFieldCapture(undefined); }} onSave={async sample => { if (fieldCapture) {
      await saveSample(sample); setSamples(current => [...current, sample]);
      fieldCapture.onSaved(sample.id); setRecordRole(undefined); setFieldCapture(undefined);
      void analyze(sample);
    } else await keep(sample, recordRole); }}/>}
    {notice && <div className={'toast ' + (notice.error ? 'toast-error' : '')} role={notice.error ? 'alert' : 'status'}><span>{notice.error ? <AudioLines size={18}/> : <Check size={18}/>}</span><p>{notice.text}</p><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice(undefined)}><X size={17}/></button></div>}
  </div>;
}
