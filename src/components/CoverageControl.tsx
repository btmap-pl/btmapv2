import {useEffect,useMemo,useState} from 'react';
import {Signal} from 'lucide-react';
import {api} from '../lib/api';

/** Operator and band of the crowdsourced coverage layer. */
export interface CoverageSelection { operator: string; tech?: string; band?: string }
interface CoverageMeta { version: string; operators: string[]; layers: Array<{ operator: string; tech: string; band: string; cells: number }> }

const COLORS: Record<string,string> = { Plus:'#13a04c', 'T-Mobile':'#e20074', Orange:'#ff7900', Play:'#8c6ec8' };

/** Tile URL of the coverage layer for Leaflet (`{z}/{x}/{y}` placeholders). */
export function coverageTileUrl(sel: CoverageSelection, version: string) {
  const q = new URLSearchParams({ operator: sel.operator, v: version });
  if (sel.tech) q.set('tech', sel.tech);
  if (sel.band) q.set('band', sel.band);
  return `/api/coverage/tiles/{z}/{x}/{y}.png?${q.toString()}`;
}

/**
 * Picker shown while the coverage layer is on: operator chips and a band list built from the
 * bands that actually have measurements for that operator.
 */
export default function CoverageControl({value,onChange,onVersion}:{value:CoverageSelection;onChange:(next:CoverageSelection)=>void;onVersion:(v:string)=>void}){
  const [meta,setMeta]=useState<CoverageMeta|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let alive=true;
    const load=()=>api<CoverageMeta>('/coverage/meta').then(m=>{if(alive){setMeta(m);onVersion(m.version);setError('');}}).catch(e=>alive&&setError((e as Error).message));
    load();
    // New measurements arrive all the time; refresh the list and the tiles every few minutes.
    const timer=setInterval(load,180000);
    return()=>{alive=false;clearInterval(timer);};
  },[onVersion]);

  const layers=useMemo(()=>(meta?.layers||[]).filter(l=>l.operator===value.operator),[meta,value.operator]);
  const cells=layers.reduce((sum,l)=>sum+l.cells,0);
  const bandKey=value.tech&&value.band?`${value.tech}|${value.band}`:'';

  return <div className="coverage-map-status" role="group" aria-label="Mapa zasięgu">
    <div className="coverage-head"><Signal size={13} aria-hidden="true"/><strong>Zasięg od użytkowników</strong>
      <span>{error?error:meta?`${new Intl.NumberFormat('pl-PL').format(cells)} kwadratów ~100 m`:'Wczytywanie…'}</span></div>
    <div className="coverage-operators">
      {(meta?.operators||Object.keys(COLORS)).map(op=>
        <button key={op} type="button" className={op===value.operator?'selected':''} style={{['--op' as string]:COLORS[op]}}
          onClick={()=>onChange({operator:op})} aria-pressed={op===value.operator}><i/>{op}</button>)}
    </div>
    <select value={bandKey} aria-label="Pasmo" onChange={e=>{
      const [tech,band]=e.target.value.split('|');
      onChange({operator:value.operator,tech:tech||undefined,band:band||undefined});
    }}>
      <option value="">Wszystkie pasma</option>
      {layers.map(l=><option key={`${l.tech}|${l.band}`} value={`${l.tech}|${l.band}`}>{l.tech==='5G'?'5G':l.tech} {l.band} MHz</option>)}
    </select>
    {meta&&!layers.length&&<p className="coverage-empty">Brak jeszcze pomiarów dla {value.operator}. Pojawią się, gdy użytkownicy aplikacji BTMap je prześlą.</p>}
  </div>;
}
