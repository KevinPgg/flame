"use client";

import { useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import { faqs } from "@project-flame/lib";
import type { FAQItem as FAQItemType } from "./types";

function FAQItem({ item }: { item: FAQItemType }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-white-10 rounded-card overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-transparent text-left hover:bg-white-5 transition-colors"
      >
        <span className="text-white-100 font-poppins-medium text-sm pr-4">
          {item.question}
        </span>
        <FiChevronDown
          size={18}
          className={`text-white-50 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          <p className="text-white-50 text-sm font-poppins leading-relaxed m-0">
            {item.answer}
          </p>
        </div>
      )}
    </div>
  );
}

export function FAQSection() {
  return (
    <div className="px-4">
      <div className="flex flex-col gap-4 mb-6">
        <h2 className="text-white-100 font-poppins-semibold text-lg m-0">
          FAQs
        </h2>
        <p className="text-white-100 text-sm font-poppins m-0">
          Do you have any other questions?
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {faqs.map((item) => (
          <FAQItem key={item.id} item={item} />
        ))}
      </div>

      <div className="flex justify-center mt-6 mb-10">
        <a
          href="https://flme.co/faqs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white-100 underline font-poppins-medium text-sm hover:opacity-80 transition-opacity"
        >
          View all FAQs
        </a>
      </div>
    </div>
  );
}
