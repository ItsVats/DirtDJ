import { Volume2, VolumeX } from 'lucide-react';
import type { Project, Sample, Track } from './types';
import { ROLES } from './types';

export default function MobileSequencer({ project, samples, step, onChange }: {
  project: Project; samples: Sample[]; step: number;
  onChange: (index: number, patch: Partial<Track>) => void;
}) {
  return <div className="mobile-sequencer">
    <div className="sequence-caption"><strong>Four sounds. One groove.</strong><span>Swipe the grid for all 16 steps</span></div>
    <div className="mobile-pattern-scroll" role="region" aria-label="Four-lane rhythm grid" tabIndex={0}>
      <div className="mobile-pattern-board">
        <div className="pattern-ruler"><span className="pattern-label">1 BAR</span><div>{Array.from({ length: 16 }, (_, position) => <span key={position} className={position === step ? 'ruler-current' : ''}>{position % 4 === 0 ? `BEAT ${position / 4 + 1}` : ''}</span>)}</div></div>
        {project.tracks.map((track, index) => {
          const role = ROLES[index];
          return <div className={'pattern-lane ' + (track.muted ? 'pattern-muted' : '')} key={role.id} style={{ '--lane-color': role.color } as React.CSSProperties}>
            <div className="pattern-label"><strong>{role.title}</strong><button className="pattern-mute" aria-label={`${track.muted ? 'Unmute' : 'Mute'} ${role.title}`} aria-pressed={track.muted} onClick={() => onChange(index, { muted: !track.muted })}>{track.muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button></div>
            <div className="pattern-steps">{track.steps.map((active, position) => <button key={position} className={'step ' + (active ? 'step-on ' : '') + (step === position ? 'current-step ' : '') + (position % 4 === 0 ? 'beat-start' : '')} aria-label={`${role.title} step ${position + 1}`} aria-pressed={active} onClick={() => onChange(index, { steps: track.steps.map((value, i) => i === position ? !value : value) })}><small>{position + 1}</small></button>)}</div>
          </div>;
        })}
      </div>
    </div>
    <div className="mobile-mixer-heading"><strong>Your sounds & levels</strong><span>Mix all four here</span></div>
    <div className="mobile-mixer">{project.tracks.map((track, index) => {
      const role = ROLES[index];
      return <div className="mobile-mixer-lane" key={role.id} style={{ '--lane-color': role.color } as React.CSSProperties}>
        <div className="mixer-lane-title"><strong>{role.title}</strong><span>{Math.round(track.volume * 100)}%</span></div>
        <select aria-label={`Sound for ${role.title}`} value={track.sampleId ?? ''} onChange={event => onChange(index, { sampleId: event.target.value || null })}><option value="">Choose a sound</option>{samples.map(sample => <option key={sample.id} value={sample.id}>{sample.name}</option>)}</select>
        <input type="range" aria-label={`${role.title} volume`} min={0} max={100} value={track.volume * 100} onChange={event => onChange(index, { volume: Number(event.target.value) / 100 })}/>
      </div>;
    })}</div>
  </div>;
}
