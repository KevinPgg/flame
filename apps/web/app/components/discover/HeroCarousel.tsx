"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import type { DiscoverEvent } from "./types";

interface HeroCarouselProps {
  events: DiscoverEvent[];
}

export function HeroCarousel({ events }: HeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);

  const count = events.length;

  activeIndexRef.current = activeIndex;

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!scrollRef.current || count === 0) return;
      const card = scrollRef.current.children[index] as HTMLElement | undefined;
      if (card) {
        scrollRef.current.scrollTo({
          left: card.offsetLeft - scrollRef.current.offsetLeft,
          behavior: "smooth",
        });
      }
      setActiveIndex(index);
      activeIndexRef.current = index;
    },
    [count]
  );

  const handlePrev = useCallback(() => {
    scrollToIndex(activeIndexRef.current === 0 ? count - 1 : activeIndexRef.current - 1);
  }, [count, scrollToIndex]);

  const handleNext = useCallback(() => {
    scrollToIndex(activeIndexRef.current === count - 1 ? 0 : activeIndexRef.current + 1);
  }, [count, scrollToIndex]);

  const handleScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!scrollRef.current || count === 0) return;
      const left = scrollRef.current.scrollLeft;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < count; i++) {
        const card = scrollRef.current.children[i] as HTMLElement;
        const cardLeft = card.offsetLeft - scrollRef.current.offsetLeft;
        const dist = Math.abs(left - cardLeft);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      setActiveIndex(best);
      activeIndexRef.current = best;
    });
  }, [count]);

  // Auto-advance every 5s; reset timer on any index change (manual or auto)
  useEffect(() => {
    if (count <= 1) return;
    timerRef.current = setInterval(() => {
      const next = activeIndexRef.current === count - 1 ? 0 : activeIndexRef.current + 1;
      scrollToIndex(next);
    }, 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [count, scrollToIndex, activeIndex]);

  if (count === 0) return null;

  return (
    <div className="relative px-4">
      {/* Carousel container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {events.map((event) => (
          <Link
            key={event.id}
            href={`/events/${event.slug}`}
            className="snap-center shrink-0 w-[calc(100%-1rem)] min-w-[280px] relative aspect-[16/9] max-h-[320px] block rounded-card overflow-hidden"
          >
            {event.image_url ? (
              <Image
                src={event.image_url}
                alt={event.name}
                fill
                className="object-cover"
                sizes="800px"
                priority={events.indexOf(event) === 0}
              />
            ) : (
              <div className="w-full h-full bg-white-10" />
            )}
            {/* Dark overlay */}
            <div
              className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
              aria-hidden
            />
            {/* Bottom content */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
              <p className="text-white-100 font-poppins-semibold text-lg md:text-xl uppercase line-clamp-2 m-0">
                {event.name}
              </p>
              <span className="inline-flex items-center gap-2 mt-2 bg-white-100 text-dark px-4 py-2 rounded-pill font-poppins-medium text-xs hover:bg-white-80 transition-colors">
                Explore Events
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Nav arrows (desktop only) */}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-10 top-1/2 -translate-y-1/2 hidden md:flex w-9 h-9 rounded-full bg-black/40 text-white-100 items-center justify-center hover:bg-black/60 transition-colors"
            aria-label="Previous"
          >
            <FiChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-10 top-1/2 -translate-y-1/2 hidden md:flex w-9 h-9 rounded-full bg-black/40 text-white-100 items-center justify-center hover:bg-black/60 transition-colors"
            aria-label="Next"
          >
            <FiChevronRight size={20} />
          </button>
        </>
      )}

      {/* Dots indicator */}
      {count > 1 && (
        <div className="flex items-center justify-center mt-3 gap-2">
          {events.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollToIndex(i)}
              className={`h-[6px] rounded-full transition-all ${
                i === activeIndex
                  ? "w-6 bg-white-100"
                  : "w-[6px] bg-white-30"
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
