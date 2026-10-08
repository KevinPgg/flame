"use client";

import { useState } from "react";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";

interface FAQ {
  question: string;
  answer: string;
}

interface FAQSection {
  title: string;
  faqs: FAQ[];
}

interface FAQsClientProps {
  faqSections: FAQSection[];
}

export default function FAQsClient({ faqSections }: FAQsClientProps) {
  const [openIndexes, setOpenIndexes] = useState<{
    [key: string]: number | null;
  }>({});

  const toggleAccordion = (sectionIndex: number, faqIndex: number) => {
    const sectionKey = `section-${sectionIndex}`;
    const currentOpenIndex = openIndexes[sectionKey];
    setOpenIndexes(prev => ({
      ...prev,
      [sectionKey]: currentOpenIndex === faqIndex ? null : faqIndex,
    }));
  };

  return (
    <div className="flex flex-col gap-10 mb-10">
      {faqSections.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          <h2 className="text-lg font-poppins-semibold text-white-100 mb-4 pb-4 border-b border-white-20">
            {section.title}
          </h2>
          <div className="flex flex-col gap-2">
            {section.faqs.map((faq, faqIndex) => {
              const isOpen =
                openIndexes[`section-${sectionIndex}`] === faqIndex;

              return (
                <div
                  key={faqIndex}
                  className={`rounded-card border overflow-hidden transition-colors ${
                    isOpen
                      ? "bg-card border-white-30"
                      : "bg-white-5 border-white-20"
                  }`}
                >
                  <button
                    className="w-full bg-transparent border-none px-5 py-4 text-left cursor-pointer flex items-center justify-between gap-4 hover:bg-white-5 transition-colors"
                    onClick={() => toggleAccordion(sectionIndex, faqIndex)}
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm font-poppins-semibold text-white-100 leading-5">
                      {faq.question}
                    </span>
                    <span className="text-white-50 shrink-0">
                      {isOpen ? (
                        <FiChevronUp size={18} />
                      ) : (
                        <FiChevronDown size={18} />
                      )}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5">
                      <p className="text-sm leading-[22px] font-poppins text-white-80 m-0">
                        {faq.answer}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
