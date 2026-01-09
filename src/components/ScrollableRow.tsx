import React from 'react';

type ScrollableRowProps = {
  children: React.ReactNode;
  className?: string;
};

export default function ScrollableRow({
  children,
  className = '',
}: ScrollableRowProps) {
  return (
    <div
      className={`flex items-stretch gap-3 overflow-x-auto pb-2 px-1 scrollbar-hide ${className}`}
    >
      {children}
    </div>
  );
}
