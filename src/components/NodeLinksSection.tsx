import { useEffect, useState } from 'react';
import { Link2, Check } from 'lucide-react';
import type { Tower, User, NodeLink, NodeLinkSuggestion } from '../types';
import { api, post } from '../lib/api';

const LINKABLE_OPERATORS = ['Orange', 'T-Mobile', 'Play', 'Plus'];

type Props = {
  tower: Tower;
  user: User | null;
  onRequireAuth: () => void;
  onNotice: (message: string) => void;
  /** gNB/eNB from a cell search that found this station only by proximity. */
  suggestion?: NodeLinkSuggestion | null;
};

/**
 * eNB/gNB numbers linked to the station, and a form to link one seen in NetMonster. UKE does not publish these
 * numbers, so for Play (station IDs such as GDA1010) a link is the only way to find a station by its gNB.
 */
export default function NodeLinksSection({ tower, user, onRequireAuth, onNotice, suggestion }: Props) {
  const operators = tower.operators.map(o => o.name).filter(name => LINKABLE_OPERATORS.includes(name));
  const suggestedOperator = suggestion?.operator && operators.includes(suggestion.operator) ? suggestion.operator : undefined;
  const [open, setOpen] = useState(Boolean(suggestion));
  const [operator, setOperator] = useState(suggestedOperator || operators[0] || '');
  const [tech, setTech] = useState<'5G' | 'LTE'>(suggestion?.tech ?? '5G');
  const [nodeId, setNodeId] = useState(suggestion ? String(suggestion.nodeId) : '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<'APPROVED' | 'PENDING' | null>(null);
  const [links, setLinks] = useState<NodeLink[]>(tower.nodeLinks ?? []);
  const hasOperators = operators.length > 0;

  // Map markers come without links, so the section loads them for the opened station.
  useEffect(() => {
    if (!hasOperators) return;
    const abort = new AbortController();
    api<NodeLink[]>(`/towers/${encodeURIComponent(tower.id)}/node-links`, { signal: abort.signal })
      .then(setLinks)
      .catch(() => {});
    return () => abort.abort();
  }, [tower.id, hasOperators, sent]);

  if (!hasOperators) return null;
  const alreadyLinked = suggestion && links.some(l => l.nodeId === suggestion.nodeId && l.tech === suggestion.tech);

  const submit = async () => {
    if (!user) return onRequireAuth();
    setBusy(true);
    try {
      const result = await post<{ status: 'APPROVED' | 'PENDING' }>('/submit', {
        type: 'NODE_LINK',
        data: { towerId: tower.id, operator, tech, nodeId: Number(nodeId) },
      });
      setSent(result.status);
      onNotice(result.status === 'APPROVED'
        ? `Przypisano ${tech === '5G' ? 'gNB' : 'eNB'} ${nodeId} do stacji.`
        : `Wysłano do moderacji: ${tech === '5G' ? 'gNB' : 'eNB'} ${nodeId}. Po zatwierdzeniu numer będzie prowadził do tej stacji.`);
    } catch (e) {
      onNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="node-links-section" aria-label="Numery gNB i eNB">
      <div className="cell-details-heading">
        <Link2 size={14} aria-hidden="true" />
        <span>gNB / eNB</span>
      </div>
      {links.length > 0 ? (
        <ul className="node-links-list">
          {links.map(l => (
            <li key={`${l.operator}-${l.tech}-${l.nodeId}`}>
              <span className="cell-tech-pill">{l.tech === '5G' ? 'gNB' : 'eNB'}</span>
              <strong>{l.nodeId}</strong>
              <span className="node-links-operator">{l.operator}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="node-links-empty">Brak przypisanych numerów. UKE ich nie publikuje – można je odczytać z NetMonstera przy stacji.</p>
      )}

      {suggestion && !alreadyLinked && !sent && (
        <p className="node-links-hint">
          Ta stacja została znaleziona po odległości. Jeśli to ona nadaje {suggestion.tech === '5G' ? 'gNB' : 'eNB'} <strong>{suggestion.nodeId}</strong>, przypisz numer – następnym razem wyszukiwarka trafi prosto tutaj.
        </p>
      )}

      {sent ? (
        <p className="node-links-sent"><Check size={14} /> {sent === 'APPROVED' ? 'Przypisano.' : 'Wysłano do moderacji.'}</p>
      ) : open ? (
        <form className="node-links-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
          {operators.length > 1 && (
            <label>
              <span>Operator</span>
              <select value={operator} onChange={e => setOperator(e.target.value)}>
                {operators.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          )}
          <label>
            <span>Technologia</span>
            <select value={tech} onChange={e => setTech(e.target.value as '5G' | 'LTE')}>
              <option value="5G">5G (gNB)</option>
              <option value="LTE">LTE (eNB)</option>
            </select>
          </label>
          <label>
            <span>{tech === '5G' ? 'gNB' : 'eNB'}</span>
            <input inputMode="numeric" pattern="[0-9]*" required value={nodeId} onChange={e => setNodeId(e.target.value.replace(/\D/g, ''))} placeholder="np. 56680" />
          </label>
          <button type="submit" className="primary-button" disabled={busy || !nodeId}>
            {busy ? 'Wysyłanie…' : user ? 'Przypisz' : 'Zaloguj się, aby przypisać'}
          </button>
        </form>
      ) : (
        <button type="button" className="secondary-button node-links-add" onClick={() => setOpen(true)}>
          <Link2 size={15} /> Przypisz gNB / eNB z NetMonstera
        </button>
      )}
    </section>
  );
}
