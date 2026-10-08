import { BrandLogo } from "@/components/BrandLogo";

function Line({ className = "" }: { className?: string }) {
  return <span className={`loading-skeleton-line ${className}`} aria-hidden="true" />;
}

export function AppRouteLoading() {
  return (
    <main className="my-leave-loading" aria-busy="true" aria-label="Loading LeaveCtrl">
      <header className="my-leave-loading-header">
        <BrandLogo className="my-leave-loading-logo" />
        <div className="my-leave-loading-actions" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </header>
      <div className="my-leave-loading-content">
        <section className="my-leave-loading-intro" aria-hidden="true">
          <Line className="eyebrow-line" />
          <Line className="title-line" />
          <Line className="copy-line" />
        </section>
        <section className="loading-skeleton-card available" aria-hidden="true">
          <Line className="section-line" />
          {[0, 1, 2].map((item) => (
            <div className="loading-balance-row" key={item}>
              <Line className="balance-name-line" />
              <Line className="balance-value-line" />
            </div>
          ))}
        </section>
        <section className="loading-action-grid" aria-hidden="true">
          <div className="loading-skeleton-card compact">
            <Line className="section-line" />
            <Line className="metric-line" />
            <Line className="copy-line short" />
          </div>
          <div className="loading-skeleton-card compact">
            <Line className="section-line" />
            <Line className="metric-line" />
            <Line className="copy-line short" />
          </div>
        </section>
      </div>
    </main>
  );
}
