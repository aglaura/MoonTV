'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type VirtualizedRowProps<T> = {
  items: T[];
  itemWidth: number;
  gap: number;
  overscan?: number;
  className?: string;
  contentClassName?: string;
  renderItem: (item: T, index: number) => ReactNode;
};

export const VirtualizedRow = <T,>({
  items,
  itemWidth,
  gap,
  overscan = 3,
  className,
  contentClassName,
  renderItem,
}: VirtualizedRowProps<T>) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState({ start: 0, end: 0 });

  const totalWidth = useMemo(() => {
    if (items.length === 0) return 0;
    return items.length * itemWidth + (items.length - 1) * gap;
  }, [gap, itemWidth, items.length]);

  const updateRange = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const scrollLeft = el.scrollLeft;
    const viewportWidth = el.clientWidth;
    const itemSpan = itemWidth + gap;

    let start = Math.max(0, Math.floor(scrollLeft / itemSpan) - overscan);
    let end = Math.min(
      items.length,
      Math.ceil((scrollLeft + viewportWidth) / itemSpan) + overscan
    );

    const active = document.activeElement as HTMLElement | null;
    const activeIndex =
      active && el.contains(active)
        ? Number.parseInt(active.dataset.tvIndex || '', 10)
        : Number.NaN;
    if (Number.isFinite(activeIndex)) {
      if (activeIndex < start) start = activeIndex;
      if (activeIndex >= end) end = Math.min(items.length, activeIndex + 1);
    }

    if (start >= end && items.length > 0) {
      end = Math.min(items.length, start + 1);
    }

    setRange((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end }
    );
  }, [gap, itemWidth, items.length, overscan]);

  useEffect(() => {
    updateRange();
  }, [updateRange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateRange());
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateRange]);

  const startOffset = range.start * (itemWidth + gap);
  const endOffset = Math.max(0, items.length - range.end) * (itemWidth + gap);

  return (
    <div
      ref={scrollRef}
      data-tv-scroll='row'
      onScroll={updateRange}
      className={`relative overflow-x-auto ${className || ''}`}
    >
      <div
        className={`flex ${contentClassName || ''}`}
        style={{
          gap: `${gap}px`,
          paddingLeft: `${startOffset}px`,
          paddingRight: `${endOffset}px`,
          minWidth: `${totalWidth}px`,
        }}
      >
        {items.slice(range.start, range.end).map((item, index) => {
          const absoluteIndex = range.start + index;
          return (
            <div
              key={absoluteIndex}
              style={{ width: `${itemWidth}px`, flex: `0 0 ${itemWidth}px` }}
            >
              {renderItem(item, absoluteIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
