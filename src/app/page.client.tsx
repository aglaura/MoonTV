/* FULL ContentRail with 3 modes:
   - TV vertical + remote
   - Tablet/PC horizontal + arrows
   - Mobile swipe + snap
*/

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import VideoCard from "@/components/VideoCard";
import { useSite } from "@/components/SiteProvider";

/* TV Navigation hook */
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

export default function ContentRail({ title, href, items }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { screenMode } = useSite();

  const isTV = screenMode === "tv";
  const isMobile = screenMode === "mobile";
  const isTabletPC = !isTV && !isMobile;

  const noData = items.length === 0;

  /* ===========================================================
     TV MODE: Remote Navigation + Focus Highlight
  ============================================================ */
  const { index: focusIndex, move: moveFocus } = useTVNavigation(items.length);

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
        const it = items[focusIndex];
        if (it) {
          window.location.href = `/douban/${it.douban_id}`;
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isTV, items.length, focusIndex]);

  /* TV auto-scroll to focused item */
  useEffect(() => {
    if (!isTV || !scrollRef.current) return;

    const container = scrollRef.current;
    const target = container.children[focusIndex] as HTMLElement;
    if (!target) return;

    const top = target.offsetTop;
    const ct = container.scrollTop;
    const ch = container.clientHeight;

    if (top < ct + 40) {
      container.scrollTo({ top: top - 40, behavior: "smooth" });
    } else if (top + 200 > ct + ch) {
      container.scrollTo({ top: top - ch + 260, behavior: "smooth" });
    }
  }, [focusIndex, isTV]);

  /* ===========================================================
     PC/Tablet horizontal scroll
  ============================================================ */
  const scrollHorizontal = (offset: number) => {
    scrollRef.current?.scrollBy({ left: offset, behavior: "smooth" });
  };

  /* ===========================================================
     MOBILE MODE — swipe, snap, momentum
  ============================================================ */
  const mobileScrollClass = isMobile
    ? `
      snap-x snap-mandatory
      scroll-pl-4 pr-6
      touch-pan-x overflow-x-auto
      overscroll-x-contain
      `
    : "";

  const mobileCardClass = isMobile
    ? "snap-start min-w-[47%]"
    : "min-w-[140px] sm:min-w-[180px]";

  /* ===========================================================
     RENDER — TV MODE
  ============================================================ */
  if (isTV) {
    return (
      <div
        className="
        relative rounded-2xl border border-gray-200/50 dark:border-gray-800
        bg-white/60 dark:bg-gray-900/50 p-4 overflow-hidden group
      "
        style={{ height: "500px" }}
      >
        {/* Title */}
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {title}
          </h3>

          {href && (
            <Link
              href={href}
              className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1"
            >
              See more <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {/* Fade overlays */}
        <div className="pointer-events-none absolute top-0 left-0 w-full h-20 bg-gradient-to-b from-black/70 to-transparent z-10" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-full h-20 bg-gradient-to-t from-black/70 to-transparent z-10" />

        {/* Vertical list */}
        <div
          ref={scrollRef}
          className="flex flex-col gap-5 overflow-y-auto pb-10 pt-2
            [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {noData && (
            <div className="text-gray-500 text-center py-4">No data</div>
          )}

          {items.map((item, idx) => {
            const focused = idx === focusIndex;
            return (
              <div
                key={idx}
                className={`transition-all duration-200 ${
                  focused
                    ? "scale-[1.08] ring-4 ring-green-400 shadow-xl opacity-100 z-20"
                    : "opacity-60"
                }`}
              >
                <VideoCard {...item} from="douban" />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ===========================================================
     RENDER — TABLET / PC MODE
  ============================================================ */
  if (isTabletPC) {
    return (
      <div
        className="
      relative rounded-2xl border border-gray-200/50 dark:border-gray-800
      bg-white/60 dark:bg-gray-900/50 p-4 overflow-hidden group
    "
      >
        {/* Title */}
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>

          {href && (
            <Link
              href={href}
              className="text-sm text-green-700 dark:text-green-400 hover:underline flex items-center gap-1"
            >
              See more <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {/* Desktop arrows */}
        <button
          onClick={() => scrollHorizontal(-450)}
          className="
          absolute left-0 top-1/2 -translate-y-1/2 z-20
          hidden md:flex opacity-0 group-hover:opacity-100
          p-3 bg-black/40 hover:bg-black/70 text-white rounded-full shadow-lg
        "
        >
          ‹
        </button>

        <button
          onClick={() => scrollHorizontal(450)}
          className="
          absolute right-0 top-1/2 -translate-y-1/2 z-20
          hidden md:flex opacity-0 group-hover:opacity-100
          p-3 bg-black/40 hover:bg-black/70 text-white rounded-full shadow-lg
        "
        >
          ›
        </button>

        {/* Fade edges */}
        <div className="pointer-events-none absolute left-0 top-0 h-full w-16 bg-gradient-to-r from-black/60 to-transparent z-10"></div>
        <div className="pointer-events-none absolute right-0 top-0 h-full w-16 bg-gradient-to-l from-black/60 to-transparent z-10"></div>

        {/* Horizontal list */}
        <div
          ref={scrollRef}
          className="
            flex gap-4 overflow-x-auto pb-3 px-1 scroll-smooth
            [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
          "
        >
          {noData && (
            <div className="text-gray-500 py-4 w-full text-center">No data</div>
          )}

          {items.map((item, idx) => (
            <div
              key={idx}
              className="min-w-[180px] transform transition hover:scale-105"
            >
              <VideoCard {...item} from="douban" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ===========================================================
     RENDER — MOBILE MODE
  ============================================================ */
  return (
    <div
      className="
      relative rounded-2xl border border-gray-200/50 dark:border-gray-800
      bg-white/60 dark:bg-gray-900/50 p-3 overflow-hidden
    "
    >
      {/* Title */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>

        {href && (
          <Link
            href={href}
            className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1"
          >
            See more <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div
        ref={scrollRef}
        className={`
          flex gap-3 overflow-x-auto pb-3 px-1
          scroll-smooth
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
          ${mobileScrollClass}
        `}
      >
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`
            ${mobileCardClass}
            active:scale-[0.97] transition-transform
          `}
          >
            <VideoCard {...item} from="douban" />
          </div>
        ))}
      </div>
    </div>
  );
}
