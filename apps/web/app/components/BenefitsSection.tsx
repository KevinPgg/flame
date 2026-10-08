import { FiArrowRight, FiEye, FiBookOpen } from "react-icons/fi";

export default function BenefitsSection() {
  const benefits = [
    {
      id: 1,
      title: "Unbeatable Convenience",
      description:
        "Skip the complications. Quick checkout, instant confirmation, and digital tickets ready when you are.",
      Icon: FiArrowRight,
    },
    {
      id: 2,
      title: "Transparent Pricing",
      description:
        "Using local Ecuadorian payment gateways means no extra charges for international transactions, your payments stay local and cost-effective.",
      Icon: FiEye,
    },
    {
      id: 3,
      title: "Diverse Event Selection",
      description:
        "Discover a world of events tailored to your interests, all in one place.",
      Icon: FiBookOpen,
    },
  ];

  return (
    <section className="py-10 md:py-14 bg-surface">
      <div className="max-w-[800px] mx-auto px-4">
        <h2 className="text-white-100 font-poppins-semibold text-lg mb-4">
          No-Fuss Fun Fetching
        </h2>
        <hr className="border-0 h-px bg-white-30 mb-8" />

        <div className="flex flex-col gap-6">
          {benefits.map((benefit) => {
            const Icon = benefit.Icon;
            return (
              <div
                key={benefit.id}
                className="bg-card border border-white-30 rounded-card p-4 md:p-6 flex flex-col md:flex-row md:items-start gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 shrink-0 text-white-100">
                    <Icon style={{ width: 32, height: 32 }} />
                  </div>
                  <h3 className="text-white-100 font-poppins-medium text-base m-0">
                    {benefit.title}
                  </h3>
                </div>
                <p className="text-white-80 text-sm leading-6 md:ml-12 md:mt-0">
                  {benefit.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
