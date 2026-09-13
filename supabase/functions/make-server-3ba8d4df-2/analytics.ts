import type { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { supabaseAdmin, getSquareConfig, squareFetch, brisbaneDateStr, dayRange as dayRangeISO, moneyAmount as moneyAmt, searchSquareOrders as fetchAllCompletedOrders } from "./shared.ts";

const PREFIX = "/make-server-3ba8d4df-2";

async function fetchAllTimecardsInRange(token: string, locationId: string, startAt: string, endAt: string) {
  const timecards: any[] = []; let cursor: string | undefined; let pages = 0;
  do { const res = await squareFetch(token, "/labor/timecards/search", { method: "POST", body: JSON.stringify({ query: { filter: { location_ids: [locationId], start: { start_at: startAt, end_at: endAt } } }, limit: 100, cursor }) }); timecards.push(...(res.timecards ?? [])); cursor = res.cursor; pages++; } while (cursor && pages < 150);
  return timecards;
}

async function fetchCatalogCategoryMap(token: string): Promise<Map<string, string>> {
  const cacheKey = "catalog_category_map";
  const cached = await kv.get(cacheKey).catch(() => null);
  if (cached && Date.now() - cached.cachedAt < 10 * 60_000) return new Map(cached.entries as [string, string][]);
  const categoryNames = new Map<string, string>();
  const map = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const res = await squareFetch(token, `/catalog/list?types=CATEGORY${cursor ? `&cursor=${cursor}` : ""}`);
    for (const obj of res.objects ?? []) if (obj.type === "CATEGORY") categoryNames.set(obj.id, obj.category_data?.name ?? "Uncategorised");
    cursor = res.cursor;
  } while (cursor);
  cursor = undefined;
  do {
    const res = await squareFetch(token, `/catalog/list?types=ITEM${cursor ? `&cursor=${cursor}` : ""}`);
    for (const obj of res.objects ?? []) {
      if (obj.type !== "ITEM") continue;
      const catId = obj.item_data?.category_id ?? obj.item_data?.categories?.[0]?.id;
      const catName = catId ? (categoryNames.get(catId) ?? "Uncategorised") : "Uncategorised";
      for (const v of obj.item_data?.variations ?? []) map.set(v.id, catName);
      map.set(obj.id, catName);
    }
    cursor = res.cursor;
  } while (cursor);
  kv.set(cacheKey, { cachedAt: Date.now(), entries: [...map.entries()] }).catch((e) => console.warn("catalog cache write failed (non-fatal)", e));
  return map;
}

function itemKeyName(li: any): string { return (li.name as string) ?? "Unknown item"; }

async function fetchAllPaymentsInRange(token: string, locationId: string, startAt: string, endAt: string) {
  const payments: any[] = [];
  const params = new URLSearchParams({ location_id: locationId, begin_time: startAt, end_time: endAt, sort_order: "ASC", limit: "100" });
  let cursor: string | undefined; let pages = 0;
  do { if (cursor) params.set("cursor", cursor); else params.delete("cursor"); const res = await squareFetch(token, `/payments?${params.toString()}`); payments.push(...(res.payments ?? [])); cursor = res.cursor; pages++; } while (cursor && pages < 150);
  return payments;
}

export function registerAnalyticsRoutes(app: Hono) {
  app.get(`${PREFIX}/square/analytics/overview`, async (c) => {
    try {
      const today = brisbaneDateStr();
      const start = c.req.query("start") || today;
      const end = c.req.query("end") || start;
      const rangeDays = Math.max(1, Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000) + 1);
      const defaultCompareEnd = new Date(new Date(`${start}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
      const defaultCompareStart = new Date(new Date(`${start}T00:00:00Z`).getTime() - rangeDays * 86400000).toISOString().slice(0, 10);
      const compareStart = c.req.query("compareStart") || defaultCompareStart;
      const compareEnd = c.req.query("compareEnd") || defaultCompareEnd;
      const { token, locationId } = await getSquareConfig();
      const { startAt, endAt } = dayRangeISO(start, end);
      const compareRange = dayRangeISO(compareStart, compareEnd);
      const db = supabaseAdmin();
      const [orders, compareOrders, itemRows, categoryMap, timecards] = await Promise.all([
        fetchAllCompletedOrders(token, locationId, startAt, endAt),
        fetchAllCompletedOrders(token, locationId, compareRange.startAt, compareRange.endAt),
        db.from("tt_items").select("name"),
        fetchCatalogCategoryMap(token).catch((e) => { console.warn("catalog fetch failed (non-fatal)", e); return new Map<string, string>(); }),
        fetchAllTimecardsInRange(token, locationId, startAt, endAt).catch(() => [] as any[]),
      ]);
      type ItemStat = { qty: number; revenue: number; discount: number };
      const byItem = new Map<string, ItemStat>();
      const byCategory = new Map<string, { qty: number; revenue: number }>();
      const byHour = new Map<string, Map<number, number>>();
      const byDow = new Array(7).fill(0) as number[];
      const pairCounts = new Map<string, number>();
      const singleOrderCounts = new Map<string, number>();
      const byModifier = new Map<string, { displayName: string; qty: number; revenue: number }>();
      let totalOrders = 0, totalRevenue = 0, totalItemsSold = 0, totalDiscount = 0;
      for (const o of orders) {
        const lineItems: any[] = o.line_items ?? [];
        if (lineItems.length === 0) continue;
        totalOrders++;
        const brisMs = new Date(o.created_at).getTime() + 10 * 3600000;
        const brisDate = new Date(brisMs);
        const brisHour = brisDate.getUTCHours();
        const dow = brisDate.getUTCDay();
        const namesInOrder = new Set<string>();
        for (const li of lineItems) {
          const name = itemKeyName(li);
          const qty = Number(li.quantity ?? "1");
          const revenue = moneyAmt(li.gross_sales_money);
          const discount = moneyAmt(li.total_discount_money);
          totalItemsSold += qty; totalRevenue += revenue; totalDiscount += discount;
          const stat = byItem.get(name) ?? { qty: 0, revenue: 0, discount: 0 };
          stat.qty += qty; stat.revenue += revenue; stat.discount += discount;
          byItem.set(name, stat);
          const category = categoryMap.get(li.catalog_object_id) ?? "Uncategorised";
          const catStat = byCategory.get(category) ?? { qty: 0, revenue: 0 };
          catStat.qty += qty; catStat.revenue += revenue;
          byCategory.set(category, catStat);
          const hourMap = byHour.get(name) ?? new Map<number, number>();
          hourMap.set(brisHour, (hourMap.get(brisHour) ?? 0) + qty);
          byHour.set(name, hourMap);
          for (const mod of (li.modifiers ?? [])) {
            const modName = (mod.name as string | undefined)?.trim();
            if (!modName) continue;
            const key = modName.toLowerCase();
            const modQty = Number(mod.quantity ?? "1") * qty;
            const modRevenue = moneyAmt(mod.total_price_money);
            const modStat = byModifier.get(key) ?? { displayName: modName, qty: 0, revenue: 0 };
            modStat.qty += modQty; modStat.revenue += modRevenue;
            byModifier.set(key, modStat);
          }
          namesInOrder.add(name);
        }
        byDow[dow] += lineItems.reduce((s, li) => s + moneyAmt(li.gross_sales_money), 0);
        const names = [...namesInOrder];
        for (const n of names) singleOrderCounts.set(n, (singleOrderCounts.get(n) ?? 0) + 1);
        for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const key = [names[i], names[j]].sort().join("|||"); pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1); }
      }
      const compareByItem = new Map<string, number>();
      for (const o of compareOrders) for (const li of (o.line_items ?? [])) { const name = itemKeyName(li); compareByItem.set(name, (compareByItem.get(name) ?? 0) + Number(li.quantity ?? "1")); }
      const leaderboard = [...byItem.entries()].map(([name, stat]) => ({ name, qty: stat.qty, revenue: stat.revenue, discount: stat.discount })).sort((a, b) => b.qty - a.qty);
      const MIN_QTY_FOR_TREND = 3;
      const trending = leaderboard.filter((i) => i.qty >= MIN_QTY_FOR_TREND).map((i) => { const prevQty = compareByItem.get(i.name) ?? 0; const growthPct = prevQty > 0 ? ((i.qty - prevQty) / prevQty) * 100 : (i.qty > 0 ? 100 : 0); return { name: i.name, qty: i.qty, prevQty, growthPct: Math.round(growthPct) }; }).sort((a, b) => b.growthPct - a.growthPct).slice(0, 15);
      const catalogNames = new Set((itemRows.data ?? []).map((r: any) => (r.name as string).toLowerCase()));
      const soldNamesLower = new Set(leaderboard.map((i) => i.name.toLowerCase()));
      const neverSold = [...catalogNames].filter((n) => !soldNamesLower.has(n));
      const basketPairs = [...pairCounts.entries()].map(([key, count]) => { const [a, b] = key.split("|||"); const aOnly = singleOrderCounts.get(a) ?? 0; const bOnly = singleOrderCounts.get(b) ?? 0; const expected = totalOrders > 0 ? (aOnly * bOnly) / totalOrders : 0; const lift = expected > 0 ? count / expected : 0; return { itemA: a, itemB: b, count, lift: Math.round(lift * 10) / 10 }; }).filter((p) => p.count >= 3).sort((a, b) => b.count - a.count).slice(0, 20);
      const categoryMix = [...byCategory.entries()].map(([category, stat]) => ({ category, qty: stat.qty, revenue: stat.revenue })).sort((a, b) => b.revenue - a.revenue);
      const hourlyHeatmap = [...byHour.entries()].map(([name, hourMap]) => ({ name, hours: Array.from({ length: 24 }, (_, h) => hourMap.get(h) ?? 0) })).filter((h) => h.hours.reduce((a, b) => a + b, 0) > 0).sort((a, b) => b.hours.reduce((x, y) => x + y, 0) - a.hours.reduce((x, y) => x + y, 0)).slice(0, 12);
      const dayOfWeekRevenue = byDow.map((revenue, dow) => ({ dow, revenue }));
      const modifiers = [...byModifier.values()].map((m) => ({ name: m.displayName, qty: m.qty, revenue: m.revenue })).sort((a, b) => b.revenue - a.revenue);
      const avgOrderValueCents = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
      const avgBasketSize = totalOrders > 0 ? Math.round((totalItemsSold / totalOrders) * 10) / 10 : 0;
      const laborHours = timecards.reduce((sum: number, tc: any) => { const startMs = new Date(tc.start_at).getTime(); const endMs = tc.end_at ? new Date(tc.end_at).getTime() : Date.now(); return sum + Math.max(0, (endMs - startMs) / 3600000); }, 0);
      const salesPerLaborHourCents = laborHours > 0 ? Math.round(totalRevenue / laborHours) : null;
      return c.json({ start, end, compareStart, compareEnd, summary: { totalOrders, totalRevenue, totalItemsSold, totalDiscount, avgOrderValueCents, avgBasketSize, laborHours: Math.round(laborHours * 10) / 10, salesPerLaborHourCents }, leaderboard: leaderboard.slice(0, 30), leastWanted: [...leaderboard].reverse().slice(0, 15), neverSold, trending, basketPairs, categoryMix, hourlyHeatmap, dayOfWeekRevenue, modifiers });
    } catch (e) { console.error("analytics overview failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  app.get(`${PREFIX}/square/analytics/staff`, async (c) => {
    try {
      const today = brisbaneDateStr();
      const start = c.req.query("start") || today;
      const end = c.req.query("end") || start;
      const { token, locationId } = await getSquareConfig();
      const { startAt, endAt } = dayRangeISO(start, end);
      const db = supabaseAdmin();
      const [payments, teamRes] = await Promise.all([fetchAllPaymentsInRange(token, locationId, startAt, endAt), db.from("tt_team").select("id, name, avatar, square_team_member_id")]);
      const bySquareId = new Map((teamRes.data ?? []).filter((t: any) => t.square_team_member_id).map((t: any) => [t.square_team_member_id, t]));
      const attributed = payments.filter((p: any) => !!p.team_member_id);
      if (attributed.length === 0) return c.json({ available: false, reason: "Payments in this range don't carry a team_member_id, so staff-level sales attribution isn't available — this usually means sales aren't being rung up under individual staff logins in Square.", staff: [] });
      const stats = new Map<string, { count: number; revenue: number; tip: number }>();
      for (const p of attributed) { const s = stats.get(p.team_member_id) ?? { count: 0, revenue: 0, tip: 0 }; s.count += 1; s.revenue += moneyAmt(p.amount_money); s.tip += moneyAmt(p.tip_money); stats.set(p.team_member_id, s); }
      const staff = [...stats.entries()].map(([sqId, s]) => { const member: any = bySquareId.get(sqId); return { teamId: member?.id ?? null, name: member?.name ?? "Unlinked staff", avatar: member?.avatar ?? "??", transactions: s.count, revenue: s.revenue, tips: s.tip, avgSaleCents: Math.round(s.revenue / s.count) }; }).sort((a, b) => b.revenue - a.revenue);
      return c.json({ available: true, start, end, staff });
    } catch (e) { console.error("analytics staff failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  app.get(`${PREFIX}/square/analytics/customers`, async (c) => {
    try {
      const today = brisbaneDateStr();
      const start = c.req.query("start") || today;
      const end = c.req.query("end") || start;
      const { token, locationId } = await getSquareConfig();
      const { startAt, endAt } = dayRangeISO(start, end);
      const orders = await fetchAllCompletedOrders(token, locationId, startAt, endAt);
      const withCustomer = orders.filter((o: any) => !!o.customer_id);
      if (withCustomer.length === 0) return c.json({ available: false, reason: "Orders in this range aren't linked to customer profiles in Square — this needs loyalty sign-ups or cards-on-file to identify repeat customers." });
      const ordersByCustomer = new Map<string, number>();
      for (const o of withCustomer) ordersByCustomer.set(o.customer_id, (ordersByCustomer.get(o.customer_id) ?? 0) + 1);
      const uniqueCustomers = ordersByCustomer.size;
      const returningInRange = [...ordersByCustomer.values()].filter((n) => n > 1).length;
      return c.json({ available: true, start, end, note: "\"Returning\" means 2+ visits within this date range, not full lifetime history.", identifiedOrders: withCustomer.length, unidentifiedOrders: orders.length - withCustomer.length, uniqueCustomers, returningInRange, singleVisitInRange: uniqueCustomers - returningInRange });
    } catch (e) { console.error("analytics customers failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  // Raw shift/timecard records — Square doesn't attribute individual sales
  // to staff here (see /square/analytics/staff), but it does record who
  // clocked in and out and when, which is enough to test staff correlation
  // against daily revenue without needing per-sale attribution.
  app.get(`${PREFIX}/square/analytics/shifts`, async (c) => {
    try {
      const today = brisbaneDateStr();
      const start = c.req.query("start") || today;
      const end = c.req.query("end") || today;
      const { token, locationId } = await getSquareConfig();
      const { startAt, endAt } = dayRangeISO(start, end);
      const db = supabaseAdmin();
      const [timecards, teamRes] = await Promise.all([
        fetchAllTimecardsInRange(token, locationId, startAt, endAt),
        db.from("tt_team").select("id, name, square_team_member_id"),
      ]);
      const bySquareId = new Map((teamRes.data ?? []).filter((t: any) => t.square_team_member_id).map((t: any) => [t.square_team_member_id, t]));
      const shifts = timecards.map((tc: any) => {
        const member: any = bySquareId.get(tc.team_member_id);
        const startMs = new Date(tc.start_at).getTime();
        const endMs = tc.end_at ? new Date(tc.end_at).getTime() : null;
        return {
          teamId: member?.id ?? null,
          name: member?.name ?? "Unlinked staff",
          date: new Date(startMs + 10 * 3600000).toISOString().slice(0, 10),
          startAt: tc.start_at,
          endAt: tc.end_at ?? null,
          hours: endMs ? Math.round(((endMs - startMs) / 3600000) * 100) / 100 : null,
        };
      });
      return c.json({ start, end, shifts });
    } catch (e) { console.error("analytics shifts failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  // Weekly per-item quantity series — for spotting an item's trend fading
  // (or holding steady) over time, which the overview leaderboard can't show
  // since it only totals one period against one comparison period.
  app.get(`${PREFIX}/square/analytics/item-trend`, async (c) => {
    try {
      const today = brisbaneDateStr();
      const start = c.req.query("start") || today;
      const end = c.req.query("end") || today;
      const { token, locationId } = await getSquareConfig();
      const { startAt, endAt } = dayRangeISO(start, end);
      const orders = await fetchAllCompletedOrders(token, locationId, startAt, endAt);
      const byWeekItem = new Map<string, Map<string, number>>();
      for (const o of orders) {
        const lineItems: any[] = o.line_items ?? [];
        if (lineItems.length === 0) continue;
        const brisDate = new Date(new Date(o.created_at).getTime() + 10 * 3600000);
        const dow = brisDate.getUTCDay();
        const mondayOffset = (dow + 6) % 7;
        const monday = new Date(brisDate);
        monday.setUTCDate(brisDate.getUTCDate() - mondayOffset);
        const weekStart = monday.toISOString().slice(0, 10);
        const wk = byWeekItem.get(weekStart) ?? new Map<string, number>();
        for (const li of lineItems) {
          const name = itemKeyName(li);
          const qty = Number(li.quantity ?? "1");
          wk.set(name, (wk.get(name) ?? 0) + qty);
        }
        byWeekItem.set(weekStart, wk);
      }
      const weeks = [...byWeekItem.keys()].sort();
      const totalByItem = new Map<string, number>();
      for (const wk of weeks) for (const [name, qty] of byWeekItem.get(wk)!) totalByItem.set(name, (totalByItem.get(name) ?? 0) + qty);
      const items = [...totalByItem.keys()].sort((a, b) => (totalByItem.get(b) ?? 0) - (totalByItem.get(a) ?? 0));
      const series = items.map((name) => ({ name, total: totalByItem.get(name) ?? 0, weeks: weeks.map((w) => byWeekItem.get(w)?.get(name) ?? 0) }));
      return c.json({ weeks, series });
    } catch (e) { console.error("analytics item-trend failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  // Daily revenue series — for correlating sales against external factors
  // (weather, holidays) that vary day to day, which the aggregate overview
  // endpoint above can't support since it only returns one total per range.
  app.get(`${PREFIX}/square/analytics/daily`, async (c) => {
    try {
      const today = brisbaneDateStr();
      const start = c.req.query("start") || today;
      const end = c.req.query("end") || today;
      const { token, locationId } = await getSquareConfig();
      const { startAt, endAt } = dayRangeISO(start, end);
      const orders = await fetchAllCompletedOrders(token, locationId, startAt, endAt);
      const byDate = new Map<string, { revenue: number; orders: number; itemsSold: number }>();
      for (const o of orders) {
        const lineItems: any[] = o.line_items ?? [];
        if (lineItems.length === 0) continue;
        const brisDateStr = new Date(new Date(o.created_at).getTime() + 10 * 3600000).toISOString().slice(0, 10);
        const stat = byDate.get(brisDateStr) ?? { revenue: 0, orders: 0, itemsSold: 0 };
        stat.orders += 1;
        for (const li of lineItems) { stat.revenue += moneyAmt(li.gross_sales_money); stat.itemsSold += Number(li.quantity ?? "1"); }
        byDate.set(brisDateStr, stat);
      }
      const days = [...byDate.entries()].map(([date, stat]) => ({ date, ...stat })).sort((a, b) => a.date.localeCompare(b.date));
      return c.json({ start, end, days });
    } catch (e) { console.error("analytics daily failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });
}
