import { useEffect, useState } from 'react';

export interface ChartTheme {
  readonly accent: string;
  readonly accentActive: string;
  readonly accentSoft: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly ink: string;
  readonly ink2: string;
  readonly inkFaint: string;
  readonly border: string;
  readonly surface: string;
  readonly surface2: string;
  readonly charts: readonly string[];
  readonly prio: { readonly high: string; readonly medium: string; readonly low: string; readonly none: string };
}

function readTheme(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => {
    const value = style.getPropertyValue(name).trim();
    return value.length > 0 ? value : fallback;
  };
  return {
    accent: token('--accent', '#4772fa'),
    accentActive: token('--accent-active', '#3e60cd'),
    accentSoft: token('--accent-soft', 'rgba(71,114,250,.12)'),
    success: token('--success', '#1f9d55'),
    warning: token('--warning', '#faa80c'),
    danger: token('--danger', '#e03131'),
    ink: token('--ink', '#191919'),
    ink2: token('--ink-2', 'rgba(25,25,25,.6)'),
    inkFaint: token('--ink-faint', 'rgba(25,25,25,.55)'),
    border: token('--border', 'rgba(25,25,25,.05)'),
    surface: token('--surface', '#ffffff'),
    surface2: token('--surface-2', 'rgba(25,25,25,.04)'),
    charts: [
      token('--chart-1', '#4772fa'),
      token('--chart-2', '#1f9d55'),
      token('--chart-3', '#faa80c'),
      token('--chart-4', '#e13e39'),
      token('--chart-5', '#6c8efb'),
      token('--chart-6', '#3e60cd'),
      token('--chart-7', '#3dbe74'),
      token('--chart-8', '#b3b3b3'),
    ],
    prio: {
      high: token('--prio-high', '#e13e39'),
      medium: token('--prio-medium', '#faa80c'),
      low: token('--prio-low', '#4772fa'),
      none: token('--prio-none', '#b3b3b3'),
    },
  };
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(readTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-accent'],
    });
    return () => {
      observer.disconnect();
    };
  }, []);
  return theme;
}
