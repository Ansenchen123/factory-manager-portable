import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { showDragPreview } from '../src/dragPreview';

describe('drag feedback', () => {
  it('replaces the native ghost and follows the pointer without intercepting card actions', () => {
    const source = document.createElement('article');
    source.className = 'listItem selected';
    source.innerHTML = '<button id="source-title">機台</button>';
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 240 } as DOMRect);
    const setDragImage = vi.fn();
    const cleanup = showDragPreview(source, { setDragImage } as unknown as DataTransfer, 30, 40);
    const preview = document.querySelector('.dragPreview') as HTMLElement;
    expect(setDragImage.mock.calls[0][0]).toBeInstanceOf(HTMLCanvasElement);
    expect(preview.getAttribute('aria-hidden')).toBe('true');
    expect(preview.inert).toBe(true);
    expect(preview.querySelector('[id]')).toBeNull();
    fireEvent(document, Object.assign(new Event('dragover'), { clientX: 100, clientY: 120 }));
    expect([preview.style.left, preview.style.top, preview.style.width]).toEqual(['80px', '100px', '240px']);
    fireEvent.dragLeave(document);
    expect(preview.style.visibility).toBe('hidden');
    fireEvent(document, Object.assign(new Event('dragover'), { clientX: 120, clientY: 130 }));
    expect(preview.style.visibility).toBe('visible');
    fireEvent.dragEnd(document);
    expect(document.querySelector('.dragPreview')).toBeNull();
    cleanup();
    expect(source.querySelector('#source-title')).not.toBeNull();
  });
});
