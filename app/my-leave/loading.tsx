import { BrandLogo } from "@/components/BrandLogo";

function SkeletonLine({ className = "" }: { className?: string }) {
  return <span className={`loading-skeleton-line ${className}`} aria-hidden="true" />;
}

export default function MyLeaveLoading() {
  return (
    <main className="my-leave-loading" aria-busy="true" aria-label="Loading My Leave">
      <header className="my-leave-loading-header">
        <BrandLogo className="my-leave-loading-logo" />
        <div className="my-leave-loading-actions" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </header>

      <div className="my-leave-loading-content">
        <section className="my-leave-loading-intro">
          <SkeletonLine className="eyebrow-line" />
          <SkeletonLine className="title-line" />
          <SkeletonLine className="copy-line" />
          <SkeletonLine className="cta-line" />
        </section>

        <section className="loading-skeleton-card available" aria-hidden="true">
          <SkeletonLine className="section-line" />
          {[0, 1, 2, 3].map((item) => (
            <div className="loading-balance-row" key={item}>
              <SkeletonLine className="balance-name-line" />
              <SkeletonLine className="balance-value-line" />
            </div>
          ))}
        </section>

        <section className="loading-action-grid" aria-hidden="true">
          <div className="loading-skeleton-card compact">
            <SkeletonLine className="section-line" />
            <SkeletonLine className="metric-line" />
            <SkeletonLine className="copy-line short" />
          </div>
          <div className="loading-skeleton-card compact">
            <SkeletonLine className="section-line" />
            <SkeletonLine className="metric-line" />
            <SkeletonLine className="copy-line short" />
          </div>
        </section>

        <section className="loading-skeleton-card context" aria-hidden="true">
          <SkeletonLine className="section-line" />
          <SkeletonLine className="copy-line" />
          <SkeletonLine className="copy-line short" />
        </section>
      </div>
    </main>
  );
}
