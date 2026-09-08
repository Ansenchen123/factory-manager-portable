import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CardLocation, DropPosition } from '../shared/items';
import { showDragPreview } from './dragPreview';

type Props = {
  location: CardLocation;
  selected: boolean;
  busy: boolean;
  dragging?: CardLocation;
  onDrag: (source?: CardLocation) => void;
  onDrop: (source: CardLocation, target: CardLocation, position: DropPosition) => void;
  onSelect: () => void;
  children: ReactNode;
};

export function SelectableCard({ location, selected, busy, dragging, onDrag, onDrop, onSelect, children }: Props) {
  const [position, setPosition] = useState<DropPosition>();
  const canStart = useRef(true);
  const cleanupPreview = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => cleanupPreview.current?.(), []);
  const isSource = dragging?.kind === location.kind && dragging.id === location.id;
  const accepts = dragging && !isSource && (dragging.kind === location.kind || dragging.kind === 'machine');
  const transfer = dragging?.kind === 'machine' && location.kind === 'line';
  return <article className={`listItem ${selected ? 'selected' : ''} ${isSource ? 'dragging' : ''} ${accepts && position ? transfer ? 'dropInto' : `drop-${position}` : ''}`}
    draggable={!busy}
    onClick={event => {
      if (!busy && !dragging && !(event.target as HTMLElement).closest('button')) onSelect();
    }}
    onMouseDownCapture={event => {
      const button = (event.target as HTMLElement).closest('button');
      canStart.current = !button || button.classList.contains('itemMain');
    }}
    onDragStart={event => {
      if (busy || !canStart.current) { event.preventDefault(); return; }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', location.id);
      cleanupPreview.current?.();
      cleanupPreview.current = showDragPreview(event.currentTarget, event.dataTransfer, event.clientX, event.clientY);
      onDrag(location);
    }}
    onDragOver={event => {
      if (busy || !accepts) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = event.currentTarget.getBoundingClientRect();
      setPosition(event.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
    }}
    onDragLeave={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPosition(undefined);
    }}
    onDrop={event => {
      event.preventDefault();
      if (!busy && accepts && dragging) {
        const rect = event.currentTarget.getBoundingClientRect();
        onDrop(dragging, location, event.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
      }
      setPosition(undefined);
      onDrag(undefined);
    }}
    onDragEnd={() => { cleanupPreview.current?.(); setPosition(undefined); onDrag(undefined); }}>
    {children}
  </article>;
}
