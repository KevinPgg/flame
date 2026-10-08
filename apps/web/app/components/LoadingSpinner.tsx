interface LoadingSpinnerProps {
  title?: string;
  subtitle?: string;
  fullHeight?: boolean;
  className?: string;
}

export default function LoadingSpinner({
  title = "Loading FLAME Events",
  subtitle,
  fullHeight = false,
  className = "",
}: LoadingSpinnerProps) {
  if (fullHeight) {
    return (
      <div
        className={`min-h-screen bg-background flex flex-col items-center justify-center gap-4 ${className}`}
      >
        <div className="animate-spin rounded-full w-10 h-10 border-2 border-white-20 border-t-white-100" />
        <h1 className="text-white-100 text-lg font-poppins-semibold m-0">{title}</h1>
        {subtitle && (
          <p className="text-white-50 text-sm font-poppins-light m-0">{subtitle}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 ${className}`}>
      <div className="animate-spin rounded-full w-8 h-8 border-2 border-white-20 border-t-white-100" />
      <p className="text-white-50 text-sm font-poppins-light m-0">{title}</p>
      {subtitle && (
        <p className="text-white-50 text-xs font-poppins-light m-0">{subtitle}</p>
      )}
    </div>
  );
}
