import { type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from './lib/utils';

export interface SortableListHelpers {
  /** Pre-built drag handle — place it anywhere inside the row. */
  handle: ReactNode;
  isDragging: boolean;
}

export interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  /** Fires with the full id array in its new order after a drop. */
  onReorder: (orderedIds: string[]) => void;
  children: (item: T, helpers: SortableListHelpers) => ReactNode;
  className?: string;
  /** Disable dragging (e.g. while a mutation is in flight). */
  disabled?: boolean;
}

function SortableRow({
  id,
  disabled,
  render,
}: {
  id: string;
  disabled?: boolean;
  render: (helpers: SortableListHelpers) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };

  const handle = (
    <button
      type="button"
      aria-label="Drag to reorder"
      disabled={disabled}
      className="flex h-7 w-7 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && 'relative z-10 opacity-80')}>
      {render({ handle, isDragging })}
    </div>
  );
}

/**
 * Generic keyboard- and pointer-accessible drag-to-reorder list (built on
 * @dnd-kit). Render-prop API: each item receives a ready-made `handle` to
 * place where it likes. On drop, `onReorder` is called with the new ordered
 * id array — the caller persists it (and typically reorders optimistically).
 */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  children,
  className,
  disabled,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = items.map(getId);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item) => (
            <SortableRow
              key={getId(item)}
              id={getId(item)}
              disabled={disabled}
              render={(helpers) => children(item, helpers)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
