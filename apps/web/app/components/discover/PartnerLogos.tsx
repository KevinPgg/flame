"use client";

import Image from "next/image";

const partners = [
  { id: "zlu", name: "ZLU", src: "/partners/zlu-logo.png", width: 81, height: 43 },
  { id: "kora", name: "Kora", src: "/partners/kora-logo.png", width: 81, height: 43 },
  { id: "hush", name: "Hush", src: "/partners/hush-logo.png", width: 81, height: 43 },
  { id: "g2g", name: "G2G", src: "/partners/g2g-logo.png", width: 81, height: 43 },
  { id: "cf", name: "CF", src: "/partners/cf-logo.png", width: 81, height: 43 },
];

export function PartnerLogos() {
  return (
    <div className="px-4">
      <p className="text-white-50 text-xs font-poppins text-center mb-4">
        We&apos;ve already powered events at
      </p>
      <div className="flex items-center justify-center gap-6 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {partners.map((p) => (
          <div key={p.id} className="shrink-0 opacity-70 hover:opacity-100 transition-opacity">
            <Image
              src={p.src}
              alt={p.name}
              width={p.width}
              height={p.height}
              className="object-contain"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
