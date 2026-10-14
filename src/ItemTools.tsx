import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Copy, Edit3, Trash2 } from 'lucide-react';

type Props = {
  name: string;
  index: number;
  count: number;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onMove: (direction: -1 | 1) => void;
  children?: ReactNode;
};

// One toolbar row per card: optional leading action, then edit/copy/order, delete set apart on the right.
export function ItemTools({ name, index, count, busy, onEdit, onDelete, onCopy, onMove, children }: Props) {
  return <div className="itemTools" role="group" aria-label={`${name} 操作`}>
    {children}
    <div className="toolButtons">
      <button className="iconButton ghost" type="button" onClick={onEdit} aria-label={`編輯 ${name}`} title="編輯"><Edit3 size={16} /></button>
      <button className="iconButton ghost" type="button" disabled={busy} onClick={onCopy} aria-label={`複製 ${name}`} title="複製"><Copy size={16} /></button>
      <button className="iconButton ghost" type="button" disabled={busy || index === 0} onClick={() => onMove(-1)} aria-label={`上移 ${name}`} title="上移"><ArrowUp size={16} /></button>
      <button className="iconButton ghost" type="button" disabled={busy || index === count - 1} onClick={() => onMove(1)} aria-label={`下移 ${name}`} title="下移"><ArrowDown size={16} /></button>
      <button className="iconButton ghost danger" type="button" onClick={onDelete} aria-label={`刪除 ${name}`} title="刪除"><Trash2 size={16} /></button>
    </div>
  </div>;
}
