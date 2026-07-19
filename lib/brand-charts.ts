// Client-safe chart-dashboard model for the brand portal. Brands (and admins)
// pick which charts to show, resize them like the gamer feed dashboard builder,
// configure each one, and save the layout to brands.chart_prefs.

export type BrandWidgetType = "timeseries" | "stat" | "placementBars" | "placementTable" | "donut";
export type BrandChartWidget = {
  id: string;
  type: BrandWidgetType;
  w: number; // 1..4 column span
  config: Record<string, string>;
};
export type BrandChartPrefs = { widgets: BrandChartWidget[] };

export const BRAND_WIDGET_META: { type: BrandWidgetType; label: string; icon: string; defaultW: number }[] = [
  { type: "timeseries", label: "Impressions & clicks", icon: "chart", defaultW: 4 },
  { type: "stat", label: "Big number", icon: "spark", defaultW: 1 },
  { type: "placementBars", label: "Placement bars", icon: "grid", defaultW: 2 },
  { type: "placementTable", label: "Placement table", icon: "menu", defaultW: 4 },
  { type: "donut", label: "Impression share", icon: "globe", defaultW: 2 },
];

// The layout a brand sees before they customize anything: the full time-series
// chart, three headline stats, a placement bar chart and the placement table.
export function defaultBrandCharts(): BrandChartPrefs {
  return {
    widgets: [
      { id: "w-series", type: "timeseries", w: 4, config: {} },
      { id: "w-imp", type: "stat", w: 1, config: { metric: "impressions" } },
      { id: "w-clk", type: "stat", w: 1, config: { metric: "clicks" } },
      { id: "w-ctr", type: "stat", w: 1, config: { metric: "ctr" } },
      { id: "w-active", type: "stat", w: 1, config: { metric: "active" } },
      { id: "w-bars", type: "placementBars", w: 2, config: { metric: "impressions" } },
      { id: "w-donut", type: "donut", w: 2, config: {} },
      { id: "w-table", type: "placementTable", w: 4, config: {} },
    ],
  };
}

// Coerce whatever is stored in the jsonb column into a valid prefs object.
export function normalizeBrandCharts(raw: unknown): BrandChartPrefs {
  const validTypes = new Set(BRAND_WIDGET_META.map((m) => m.type));
  if (raw && typeof raw === "object" && Array.isArray((raw as { widgets?: unknown }).widgets)) {
    const widgets = ((raw as { widgets: unknown[] }).widgets)
      .map((w) => (w && typeof w === "object" ? (w as Partial<BrandChartWidget>) : null))
      .filter((w): w is Partial<BrandChartWidget> => !!w && typeof w.type === "string" && validTypes.has(w.type as BrandWidgetType))
      .map((w, i) => ({
        id: typeof w.id === "string" ? w.id : `w-${i}`,
        type: w.type as BrandWidgetType,
        w: Math.max(1, Math.min(4, Number(w.w) || 1)),
        config: w.config && typeof w.config === "object" ? (w.config as Record<string, string>) : {},
      }));
    if (widgets.length) return { widgets };
  }
  return defaultBrandCharts();
}
