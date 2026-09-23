import { useEffect, useRef } from 'react';
import type { EpubTocItem } from '../shared/epubToc';

interface EpubTocPanelProps {
  items: EpubTocItem[];
  activeIndex: number;
  onSelect: (item: EpubTocItem) => void;
}

export function EpubTocPanel({ items, activeIndex, onSelect }: EpubTocPanelProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <nav className="epub-toc" aria-label="Table of contents">
      <div className="epub-toc-scroller">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            ref={index === activeIndex ? activeRef : undefined}
            className={`epub-toc-item${index === activeIndex ? ' active' : ''}`}
            onClick={() => onSelect(item)}
            title={item.label}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
