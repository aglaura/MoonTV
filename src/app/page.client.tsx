/* TV + Desktop ContentRail (FULL VERSION) */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import VideoCard from "@/components/VideoCard";
import { tt } from "@/lib/localeFunctions"; // <--- same tt() you use
import { useSite } from "@/components/SiteProvider";

type CardItem = {
  title: string;
  poster?: string;
  rate?: string;
  year?: string;
  douban_id?: number;
  type?: string;
  query?: string;
  source_name?: string;
  id?: string | number;
};

/* ---------------------------
   TV Navigation Hook
---------------------------- */
function useTVNavigation(max: number) {
  const [index, setIndex] = useState(0);

  const move = (dir: number) => {
    setIndex((prev) => {
      let next = prev + dir;
      if (next < 0) next = 0;
      if (next >= max) next = max - 1;
      return next;
    });
  };

  return { index, move, setIndex };
}

/* ===========================================================
   MAIN COMPONENT  — COMPLETE VERSION
=========================================================== */
export default function ContentRail({
  title,
  href,
  items,
}: {
  title: string;
  href?: string;
  items: CardItem[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const onSelectItemRef = useRef<(item: CardItem) => void>(() => {});

  const { screenMode } = useSite();
  const isTV = screenMode === "tv";
  const noData = items.length === 0;

  /* TV Focus Navigation */
  const { index: focusIndex, move: moveFocus, setIndex: setFocusIndex } =
    useTVNavigation(items.length);

  /* Keyboard event handler for TV mode */
  useEffect(() => {
    if (!isTV) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        moveFocus(1);
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        moveFocus(-1);
        e.preventDefault();
      } else if (e.key === "Enter") {
        const item = items[focusIndex];
        if (item) onSelectItemRef.current(item);
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isTV, items.length, focusIndex]);

  /* Auto-scroll to keep focused item visible */
  useEffect(() => {
    if (!isTV || !scrollRef.current) return;

    const container = scrollRef.current;
    const target = container.children[focusIndex] as HTMLElement;
    if (!target) return;

    const targetTop = target.offsetTop;
    const containerTop = container.scrollTop;
    const containerHeight = container.clientHeight;

    // Adjust view to keep focused card in center-ish
    if (targetTop < containerTop + 40) {
      container.scrollTo({ top: targetTop - 40, behavior: "smooth" });
    } else if (targetTop + 200 > containerTop + containerHeight) {
      container.scrollTo({
        top: targetTop - containerHeight + 260,
        behavior: "smooth",
      });
    }
  }, [focusIndex, isTV]);

  /* Horizontal scroll for desktop/mobile */
  const scrollHorizontal = (offset: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: offset,
      behavior: "smooth",
    });
  };

  /* Vertical scroll for TV */
  const scrollVertical = (offset: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      top: offset,
      behavior: "smooth",
    });
  };

  /* ---------------- TV MODE ---------------- */
  if (isTV) {
    return (
      <div
        className="
          relative rounded-2xl border border-gray-200/50 dark:border-gray-800
          bg-white/60 dark:bg-gray-900/50 p-4 overflow-hidden
          group
        "
        style={{ height: "480px" }}
      >
        {/* Title */}
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          {href && (
            <Link
              href={href}
              className="text-sm text-green-700 dark:text-green-400 hover:underline inline-flex items-center gap-1"
            >
              {tt("See more", "查看更多", "查看更多")}
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {/* Up Arrow */}
        <button
          onClick={() => scrollVertical(-300)}
          className="
            absolute top-2 left-1/2 -translate-x-1/2 z-20
            opacity-0 group-hover:opacity-100 transition
            p-2 rounded-full bg-black/40 hover:bg-black/70 text-white shadow
          "
        >
          ▲
        </button>

        {/* Down Arrow */}
        <button
          onClick={() => scrollVertical(300)}
          className="
            absolute bottom-2 left-1/2 -translate-x-1/2 z-20
            opacity-0 group-hover:opacity-100 transition
            p-2 rounded-full bg-black/40 hover:bg-black/70 text-white shadow
          "
        >
          ▼
        </button>

        {/* Fade gradients top/bottom */}
        <div className="pointer-events-none absolute top-0 left-0 w-full h-20 bg-gradient-to-b from-white/80 dark:from-black/80 to-transparent z-10" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-full h-20 bg-gradient-to-t from-white/80 dark:from-black/80 to-transparent z-10" />

        {/* Scrollable vertical list */}
        <div
          ref={scrollRef}
          className="
            flex flex-col gap-4 overflow-y-auto pt-2 pb-10
            [-ms-overflow-style:'none'] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
          "
        >
          {noData && (
            <div className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
              {tt("No data", "暂无数据", "暫無資料")}
            </div>
          )}

          {items.map((item, idx) => {
            const focused = idx === focusIndex;
            return (
              <div
                key={idx}
                className={`
                  w-full transition-all duration-200
                  ${
                    focused
                      ? "scale-[1.05] ring-4 ring-green-400 shadow-xl z-20 opacity-100"
                      : "opacity-60"
                  }
                `}
              >
                <VideoCard
                  from="douban"
                  title={item.title}
                  poster={item.poster}
                  douban_id={item.douban_id}
                  rate={item.rate}
                  year={item.year}
                  type={item.type}
                  query={item.query}
                  source_name={item.source_name}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ------------- DESKTOP / MOBILE MODE (Horizontal) ------------- */
  return (
    <div
      className="
        relative rounded-2xl border border-gray-200/50 dark:border-gray-800
        bg-white/60 dark:bg-gray-900/50 p-3 sm:p-4 overflow-hidden group
      "
    >
      {/* Title */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        {href && (
          <Link
            href={href}
            className="text-sm text-green-700 dark:text-green-400 hover:underline inline-flex items-center gap-1"
          >
            {tt("See more", "查看更多", "查看更多")}
            <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* Left Arrow */}
      <button
        onClick={() => scrollHorizontal(-450)}
        className="
          absolute left-0 top-1/2 -translate-y-1/2 z-20
          hidden sm:flex opacity-0 group-hover:opacity-100 transition
          p-3 rounded-full bg-black/40 hover:bg-black/60 text-white shadow-lg
        "
      >
        ‹
      </button>

      {/* Right Arrow */}
      <button
        onClick={() => scrollHorizontal(450)}
        className="
          absolute right-0 top-1/2 -translate-y-1/2 z-20
          hidden sm:flex opacity-0 group-hover:opacity-100 transition
          p-3 rounded-full bg-black/40 hover:bg-black/60 text-white shadow-lg
        "
      >
        ›
      </button>

      {/* Fade left/right */}
      <div className="pointer-events-none absolute left-0 top-0 h-full w-16 bg-gradient-to-r from-white/80 dark:from-black/60 to-transparent z-10"></div>
      <div className="pointer-events-none absolute right-0 top-0 h-full w-16 bg-gradient-to-l from-white/80 dark:from-black/60 to-transparent z-10"></div>

      {/* Horizontal list */}
      <div
        ref={scrollRef}
        className="
          flex gap-3 overflow-x-auto pb-3 px-1 scroll-smooth
          [-ms-overflow-style:'none'] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
        "
      >
        {noData && (
          <div className="text-sm text-gray-500 dark:text-gray-400 py-4">
            {tt("No data", "暂无数据", "暫無資料")}
          </div>
        )}

        {items.map((item, idx) => (
          <div
            key={idx}
            className="
              min-w-[140px] w-36 sm:min-w-[180px] sm:w-44
              transform transition duration-200 hover:scale-105
            "
          >
            <VideoCard {...item} from="douban" />
          </div>
        ))}
      </div>
    </div>
  );
}
