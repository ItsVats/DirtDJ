import { useEffect, useRef, useState } from 'react';
import { Search, Volume2, Mic, Check, Timer, X, Award, LoaderCircle } from 'lucide-react';
import type { Sample } from './types';
import { claimDiscovery, clueById, createDetective, judgeSound, nextClue, parseDetective, startAttempt, swapClue, type DetectiveCapture, type DetectiveGame } from './detective';
import { readMission, stopMissionVoice } from './voice';
import { audioContext } from './audio/engine';
import { cancelFieldReminder, foregroundFieldCue, scheduleFieldReminder } from './field-reminder';

const key = 'dirtdj-detective-v1';
const storedGame = () => { try { return parseDetective(localStorage.getItem(key)); } catch { return undefined; } };
export default function SoundDetective({ disabled, samplesLoaded, samples, busyId, onCapture, onAnalyze, onSearch }: {
  disabled: boolean; samplesLoaded: boolean; samples: Sample[]; busyId?: string;
  onCapture: (request: DetectiveCapture) => void; onAnalyze: (sample: Sample) => Promise<Sample | undefined>; onSearch: () => void;
}) {
  const [game, setGame] = useState<DetectiveGame | undefined>(storedGame);
  const [pocket, setPocket] = useState(false);
  const [hint, setHint] = useState(false);
  const [remind, setRemind] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  const cued = useRef(0);
  const index = game ? game.attempt?.index ?? nextClue(game) : -1;
  const clue = game && index >= 0 ? clueById(game.clueIds[index]) : undefined;
  const attemptSample = samples.find(sample => sample.id === game?.attempt?.sampleId);
  const checking = Boolean(attemptSample && busyId === attemptSample.id);
  const verdict = game && clue && attemptSample?.predictions.length ? judgeSound(clue.id, attemptSample.predictions) : undefined;
  const discovery = game && index >= 0 ? game.discoveries[index] : null;
  const count = game?.discoveries.filter(Boolean).length ?? 0;
  const matches = game?.discoveries.filter(d => d?.verified).length ?? 0;
  const finished = count === 4;
  const remaining = game?.searchUntil ? Math.max(0, Math.ceil((game.searchUntil - now) / 1000)) : 0;

  useEffect(() => () => stopMissionVoice(), []);
  useEffect(() => { try { if (game) localStorage.setItem(key, JSON.stringify(game)); } catch { setMessage('Progress could not be saved. Keep this session open to finish.'); } }, [game]);
  useEffect(() => {
    if (!game || !samplesLoaded) return;
    const available = new Set(samples.map(sample => sample.id));
    if (game.discoveries.some(d => d && !available.has(d.sampleId)) || (game.attempt && !available.has(game.attempt.sampleId))) {
      setGame(current => {
        if (!current) return current;
        const updated = { ...current, discoveries: current.discoveries.map(d => d && !available.has(d.sampleId) ? null : d) };
        const attempt = current.attempt;
        return { ...updated, attempt: attempt && available.has(attempt.sampleId) && (updated.discoveries[attempt.index] || attempt.index === nextClue(updated)) ? attempt : null };
      });
    }
  }, [samples, samplesLoaded, game]);
  useEffect(() => {
    if (verdict?.kind === 'match' && attemptSample && !discovery) setGame(current => current ? claimDiscovery(current, attemptSample.id, true) : current);
  }, [verdict?.kind, attemptSample?.id, discovery]);
  useEffect(() => {
    if (!game?.searchUntil) return;
    const update = () => setNow(Date.now()); update();
    const timer = setInterval(update, 1000); document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [game?.searchUntil]);
  useEffect(() => {
    if (game?.searchUntil && now >= game.searchUntil && remind && cued.current !== game.searchUntil) { cued.current = game.searchUntil; foregroundFieldCue(); }
  }, [now, game?.searchUntil, remind]);
  useEffect(() => {
    if (!pocket) return;
    const before = document.activeElement as HTMLElement | null;
    const dialog = document.getElementById('pocket-dialog')!; dialog.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { stopMissionVoice(); setPocket(false); }
      if (event.key === 'Tab') {
        const controls = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('keydown', keys); before?.focus(); };
  }, [pocket]);

  async function cancelCue() { try { await cancelFieldReminder(); } catch { setMessage('Your earlier reminder may still appear.'); } }
  async function newCase() {
    stopMissionVoice(); setWorking(true); await cancelCue();
    setGame(createDetective(crypto.getRandomValues(new Uint32Array(1))[0])); setHint(false); setMessage(''); setWorking(false);
  }
  async function explore(spoken = false) {
    if (!game || !clue) return;
    stopMissionVoice(); onSearch(); setWorking(true);
    const speech = spoken ? readMission(`${clue.title}. ${clue.riddle} Put your phone away. Come back when you find your sound.`).catch(() => false) : Promise.resolve(true);
    const until = Date.now() + 90000;
    try {
      if (remind) setMessage(await scheduleFieldReminder(until, clue.riddle));
      else { await cancelCue(); setMessage('No timer pressure. Come back when you find your sound.'); }
    } catch { setMessage('The reminder could not be set. Come back whenever you are ready.'); }
    finally {
      if (!await speech) setMessage('No installed English voice is available. Read the clue once, then put your phone away.');
      setGame(current => current?.id === game.id ? { ...current, searchUntil: until } : current);
      setNow(Date.now()); setPocket(true); setWorking(false);
    }
  }
  async function capture() {
    if (!game || !clue) return;
    stopMissionVoice(); void audioContext().resume().catch(() => {});
    setWorking(true); await cancelCue(); setWorking(false); setPocket(false);
    setGame(current => current ? { ...current, attempt: null, searchUntil: null } : current);
    onCapture({ prompt: clue.riddle, name: `Detective · ${clue.title}`, duration: 3,
      onSaved: sampleId => setGame(current => current?.id === game.id ? startAttempt(current, index, sampleId) : current) });
  }
  async function differentClue() {
    stopMissionVoice(); setWorking(true); await cancelCue();
    setGame(current => current ? swapClue(current) : current); setHint(false); setMessage(''); setWorking(false);
  }
  function continueCase() { stopMissionVoice(); setGame(current => current ? { ...current, attempt: null } : current); setHint(false); setMessage(''); }

  return <section className="field-game-panel detective-panel" aria-labelledby="detective-title">
    <div className="game-heading"><Search size={24}/><div><span className="eyebrow">LOOK UP. LISTEN. SOLVE.</span><h2 id="detective-title">Sound Detective</h2><p>The world hides the answers. Follow four clues and let local AI check your finds.</p></div><span className="detective-tag">SOLO / OFFLINE</span></div>
    <div className="game-content">{!game ? <div className="detective-intro"><p>A travelling drum. A hidden singer. A secret password. Which sounds will you uncover?</p><p className="mission-hint">Hear a clue, put your phone away, then return for a three-second capture. Your discoveries become a casebook.</p><button className="button primary" disabled={disabled || working} onClick={newCase}><Search size={16}/>Open a case</button></div> : <>
      <div className="game-progress"><span>{count} / 4 discoveries · {matches} AI {matches === 1 ? 'match' : 'matches'}</span><div aria-label={`${count} of 4 clues solved`}>{game.discoveries.map((d, i) => <span key={i} className={d ? 'mission-done' : ''}>{d ? <Check size={13}/> : i + 1}</span>)}</div></div>
      {finished ? <div className="detective-finished"><Award size={35}/><h3>Case closed. Ears open.</h3><p>You uncovered four sounds hiding in plain sight.</p><ul className="casebook">{game.discoveries.map((d, i) => <li key={game.clueIds[i]}><Check size={16}/><div><strong>{clueById(game.clueIds[i]).answer}</strong><span>{d?.verified ? 'AI matched' : 'Confirmed by you'}</span></div></li>)}</ul><p className="mission-hint">{matches} AI {matches === 1 ? 'match' : 'matches'} · {4 - matches} confirmed by you. Your evidence stays in Field notes.</p><button className="button primary" disabled={disabled || working} onClick={newCase}>Open another case</button></div> : clue && <div className="mission-card">
        <span className="eyebrow">CLUE {index + 1} / THE {['FIRST', 'SECOND', 'THIRD', 'FOURTH'][index]} MYSTERY</span><h3>{clue.title}</h3><p className="detective-riddle">{clue.riddle}</p>
        {game.attempt && attemptSample ? <div className={'detective-verdict ' + (discovery ? 'verdict-match' : '')} aria-live="polite">
          {checking ? <><LoaderCircle className="spin" size={22}/><h4>Checking your evidence…</h4><p>The model is listening on this device. You can look up while it works.</p></> : discovery ? <><Award size={24}/><h4>{discovery.verified ? 'Mystery solved.' : 'Discovery kept.'}</h4><p>{discovery.verified ? `AI matched ${verdict?.target?.label ?? clue.answer}.` : 'You confirmed this find. It is recorded separately from AI matches.'}</p><button className="button primary" onClick={continueCase}>Next clue</button></> : <>
            <h4>{verdict ? 'Not sure yet.' : 'AI check unavailable.'}</h4><p>{verdict?.heard ? `AI heard ${verdict.heard.label}. That is not a clear match for this clue.` : 'Your recording is saved. The model could not check it. You can retry the check or keep your own discovery.'}</p><p className="mission-hint">Nearby sounds can confuse the model. A closer recording may help.</p><div className="mission-actions"><button className="button primary" disabled={disabled || working} onClick={capture}><Mic size={15}/>Try another sound</button><button className="button" disabled={disabled} onClick={() => { void onAnalyze(attemptSample); }}>Check again</button><button className="text-button" disabled={disabled} onClick={() => { setGame(current => current ? claimDiscovery(current, attemptSample.id, false) : current); }}>I found it — keep discovery</button></div>
          </>}
        </div> : <>
          <button className="text-button clue-hint" aria-expanded={hint} onClick={() => setHint(!hint)}>{hint ? 'Hide hint' : 'Need a hint?'}</button>{hint && <p className="clue-hint-copy">{clue.hint}</p>}
          <p className="mission-hint">Hear or read once. Explore with your phone locked. Capture only when you return.</p><label className="reminder-toggle"><input type="checkbox" checked={remind} onChange={event => setRemind(event.target.checked)}/>Remind me after about 90 seconds</label>
          <div className="mission-actions"><button className="button" disabled={working} onClick={() => { void explore(true); }}><Volume2 size={15}/>Hear & explore</button><button className="button" disabled={working} onClick={() => { void explore(); }}><Timer size={15}/>Put phone away</button><button className="button primary" disabled={disabled || working} onClick={capture}><Mic size={15}/>Found it. Check my sound</button></div>
        </>}
        {!discovery && <button className="text-button game-reset" disabled={disabled || working} onClick={differentClue}>Find a different clue</button>}
      </div>}
    </>}{message && <p className="game-message" role="status">{message}</p>}</div>
    {pocket && clue && <div className="pocket-overlay"><section id="pocket-dialog" role="dialog" aria-modal="true" aria-labelledby="pocket-title" tabIndex={-1}><button className="icon-button pocket-close" aria-label="Close pocket view" onClick={() => { stopMissionVoice(); setPocket(false); }}><X size={22}/></button><Search size={36}/><span className="eyebrow">SOUND DETECTIVE / CLUE {index + 1}</span><h2 id="pocket-title">Look up.<br/>Follow your ears.</h2><p>{clue.riddle}</p><span className="pocket-time">{remaining ? `${remaining}s to explore` : 'Ready whenever you are'}</span><p className="pocket-note">Lock your phone or put it away. No recording is running.<br/>{message}</p><button className="button primary" disabled={disabled || working} onClick={capture}><Mic size={17}/>Found it. Capture three seconds.</button></section></div>}
  </section>;
}
