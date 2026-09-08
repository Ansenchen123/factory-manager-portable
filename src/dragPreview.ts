// Chromium makes its native drag image translucent independently of CSS opacity.
// Hide that image and draw a pointer-transparent preview in the document instead.
export function showDragPreview(card: HTMLElement, transfer: DataTransfer, x: number, y: number): () => void {
  const rect = card.getBoundingClientRect();
  const offsetX = x - rect.left;
  const offsetY = y - rect.top;
  const preview = card.cloneNode(true) as HTMLElement;
  preview.classList.remove('dragging', 'drop-before', 'drop-after', 'dropInto');
  preview.classList.add('dragPreview');
  preview.removeAttribute('id');
  preview.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  preview.setAttribute('aria-hidden', 'true');
  preview.inert = true;
  preview.draggable = false;
  preview.style.width = `${rect.width}px`;
  const move = (event: { clientX: number; clientY: number }) => {
    preview.style.visibility = 'visible';
    preview.style.left = `${event.clientX - offsetX}px`;
    preview.style.top = `${event.clientY - offsetY}px`;
  };
  const leave = (event: DragEvent) => {
    if (!event.relatedTarget) preview.style.visibility = 'hidden';
  };
  const emptyImage = document.createElement('canvas');
  emptyImage.width = emptyImage.height = 1;
  transfer.setDragImage(emptyImage, 0, 0);
  move({ clientX: x, clientY: y });
  document.body.append(preview);
  document.addEventListener('dragover', move);
  document.addEventListener('dragleave', leave);
  const cleanup = () => {
    preview.remove();
    document.removeEventListener('dragover', move);
    document.removeEventListener('dragleave', leave);
    document.removeEventListener('dragend', cleanup);
    document.removeEventListener('drop', cleanup);
  };
  document.addEventListener('dragend', cleanup);
  document.addEventListener('drop', cleanup);
  return cleanup;
}
