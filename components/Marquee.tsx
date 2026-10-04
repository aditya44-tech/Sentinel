import React from 'react';

const marqueeItems = [
  "DETERMINISTIC RISK SCORING",
  "AI-GENERATED NARRATIVES",
  "INTERVENTION TRACKING",
  "ESCALATION LADDER",
  "OUTCOME COMPARISON"
];

export function Marquee() {
  // Duplicate items a few times to ensure seamless infinite scroll
  // We need enough items to fill more than 2x screen width so it can loop seamlessly by moving -50%
  const allItems = [...marqueeItems, ...marqueeItems, ...marqueeItems, ...marqueeItems];

  return (
    <div className="w-full bg-[#0D0D0D] border-y-4 border-[#0D0D0D] overflow-hidden py-3 flex whitespace-nowrap">
      <div className="animate-marquee flex w-fit">
        {allItems.map((item, index) => (
          <div key={index} className="flex items-center">
            <span className="text-[#d4ff00] font-mono font-bold text-xl uppercase px-4">
              {item}
            </span>
            {/* Don't render separator after the very last item in the array to keep spacing even,
                though since we duplicate so many times, it barely matters. */}
            <span className="text-white font-mono font-bold text-xl px-4">
              :
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
