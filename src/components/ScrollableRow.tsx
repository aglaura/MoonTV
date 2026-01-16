import React from 'react';

type ScrollableRowProps = {
  children: React.ReactNode;
  className?: string;
  dataTvGroup?: string;
  dataTvDirection?: 'horizontal' | 'vertical' | 'grid';
};

export default function ScrollableRow({
  children,
  className = '',
  dataTvGroup,
  dataTvDirection,
}: ScrollableRowProps) {
  return (
    <div
      className={`flex items-stretch gap-3 overflow-x-auto pb-2 px-1 scrollbar-hide ${className}`}
      data-tv-group={dataTvGroup}
      data-tv-direction={dataTvDirection}
    >
      {children}
    </div>
  );
}
