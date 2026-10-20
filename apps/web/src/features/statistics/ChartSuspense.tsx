import { lazy, Suspense, type ReactNode } from 'react';

const TrendChart = lazy(async () => {
  const mod = await import('./charts');
  return { default: mod.TrendChart };
});
const RateChart = lazy(async () => {
  const mod = await import('./charts');
  return { default: mod.RateChart };
});
const FocusTrendChart = lazy(async () => {
  const mod = await import('./charts');
  return { default: mod.FocusTrendChart };
});
const HourHistogram = lazy(async () => {
  const mod = await import('./charts');
  return { default: mod.HourHistogram };
});
const HabitLineChart = lazy(async () => {
  const mod = await import('./charts');
  return { default: mod.HabitLineChart };
});

function Shell({ children }: { readonly children: ReactNode }) {
  return <Suspense fallback={<div className="stats-skeleton chart" />}>{children}</Suspense>;
}

export const Charts = {
  TrendChart: (props: Parameters<typeof TrendChart>[0]) => (
    <Shell>
      <TrendChart {...props} />
    </Shell>
  ),
  RateChart: (props: Parameters<typeof RateChart>[0]) => (
    <Shell>
      <RateChart {...props} />
    </Shell>
  ),
  FocusTrendChart: (props: Parameters<typeof FocusTrendChart>[0]) => (
    <Shell>
      <FocusTrendChart {...props} />
    </Shell>
  ),
  HourHistogram: (props: Parameters<typeof HourHistogram>[0]) => (
    <Shell>
      <HourHistogram {...props} />
    </Shell>
  ),
  HabitLineChart: (props: Parameters<typeof HabitLineChart>[0]) => (
    <Shell>
      <HabitLineChart {...props} />
    </Shell>
  ),
};
