import { KeyboardSensor, PointerSensor, useSensor, useSensors, type Announcements } from '@dnd-kit/core';
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties, ReactNode } from 'react';
import { IconGrip } from './icons';

/** Mouse drag starts after 4 px of movement (so clicks still work); keyboard: focus the grip, Space, arrows, Space. */
export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

export const dragA11y = {
  screenReaderInstructions: {
    draggable: 'Aby przenieść, naciśnij spację, użyj strzałek, a potem spację, aby upuścić. Escape anuluje.',
  },
  announcements: {
    onDragStart: () => 'Podniesiono element.',
    onDragOver: () => 'Przesunięto.',
    onDragEnd: () => 'Upuszczono.',
    onDragCancel: () => 'Anulowano przenoszenie.',
  } satisfies Announcements,
};

interface Props {
  id: string;
  label: string;
  data?: Record<string, unknown>;
  className?: string;
  children: ReactNode;
}

/** A row that can be dragged by its grip handle. */
export function SortableRow({ id, label, data, className = '', children }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, data });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 5 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className={`sortable ${className}${isDragging ? ' dragging' : ''}`}>
      <button type="button" ref={setActivatorNodeRef} className="grip" aria-label={`Przenieś: ${label}`} {...attributes} {...listeners}>
        <IconGrip />
      </button>
      {children}
    </div>
  );
}
