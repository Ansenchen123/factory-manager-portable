type Props = {
  name: string;
  index: number;
  count: number;
  busy: boolean;
  onCopy: () => void;
  onMove: (direction: -1 | 1) => void;
};

export function ItemTools({ name, index, count, busy, onCopy, onMove }: Props) {
  return <div className="itemTools" role="group" aria-label={`${name} 排序與複製`}>
    <button className="secondaryButton compact" type="button" disabled={busy} onClick={onCopy} aria-label={`複製 ${name}`}>複製</button>
    <button className="secondaryButton compact" type="button" disabled={busy || index === 0} onClick={() => onMove(-1)} aria-label={`上移 ${name}`} title="上移">↑</button>
    <button className="secondaryButton compact" type="button" disabled={busy || index === count - 1} onClick={() => onMove(1)} aria-label={`下移 ${name}`} title="下移">↓</button>
  </div>;
}
