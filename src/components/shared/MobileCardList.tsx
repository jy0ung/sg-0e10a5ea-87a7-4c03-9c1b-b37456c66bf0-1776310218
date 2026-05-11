import React from 'react';

interface MobileCardListProps<T> {
  data: T[];
  renderCard: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
  className?: string;
}

/**
 * Renders a vertical list of cards on small screens (<sm).
 * Pair with a DataTable/table that is hidden on <sm to give a responsive layout:
 *
 *   <MobileCardList data={rows} renderCard={...} /> {/* visible below sm *\/}
 *   <table className="hidden sm:table ...">...</table>
 */
export function MobileCardList<T>({ data, renderCard, emptyMessage = 'No items found', className }: MobileCardListProps<T>) {
  if (data.length === 0) {
    return (
      <div className={`sm:hidden py-10 text-center text-muted-foreground text-xs ${className ?? ''}`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`sm:hidden space-y-3 ${className ?? ''}`}>
      {data.map((item, index) => (
        <React.Fragment key={index}>{renderCard(item, index)}</React.Fragment>
      ))}
    </div>
  );
}
