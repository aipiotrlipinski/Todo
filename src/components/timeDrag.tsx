// Dragging tasks onto the day timeline (Today) and between columns (week board).
import { MouseSensor, TouchSensor, useDraggable, useSensor, useSensors, type DragMoveEvent } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import { IconGrip } from './icons';

/** Mouse: drag after 4 px (clicks still work). Touch: hold ~¼ s, so the page still scrolls normally. */
export function useTimeSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );
}

export const SNAP = 15; // minutes

/** Data attached to the timeline drop zone. */
export interface TimelineDrop {
  kind: 'timeline';
  date: string;
  startMin: number;
  hourPx: number;
}

/** Minute of the day where the dragged item's top edge is over the timeline (snapped to 15 min), or null. */
export function minuteAt(e: Pick<DragMoveEvent, 'active' | 'over'>): number | null {
  const d = e.over?.data.current as TimelineDrop | undefined;
  const top = e.active.rect.current.translated?.top;
  if (!d || d.kind !== 'timeline' || top === undefined || !e.over) return null;
  const raw = d.startMin + ((top - e.over.rect.top) / d.hourPx) * 60;
  const snapped = Math.round(raw / SNAP) * SNAP;
  return Math.max(0, Math.min(24 * 60 - SNAP, snapped));
}

/** A row that can be picked up by its grip (or by holding it on a phone). */
export function DraggableRow({ id, label, data, children }: { id: string; label: string; data: Record<string, unknown>; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id, data });
  return (
    <div ref={setNodeRef} className={`sortable drag-row${isDragging ? ' dragging' : ''}`} {...listeners}>
      <button type="button" ref={setActivatorNodeRef} className="grip" aria-label={`Przenieś: ${label}`} {...attributes}>
        <IconGrip />
      </button>
      {children}
    </div>
  );
}
