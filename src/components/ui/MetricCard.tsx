import type { MetricCardData } from "../../types/pdi";

interface MetricCardProps {
  metric: MetricCardData;
}

export function MetricCard({ metric }: MetricCardProps) {
  return (
    <article className="metric-card">
      <span className="metric-label">{metric.label}</span>
      <strong className="metric-value">{metric.value}</strong>
      <p className="metric-detail">{metric.detail}</p>
      <span className="metric-trend">{metric.trend}</span>
    </article>
  );
}

