import type { Hono } from "npm:hono";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import { supabaseAdmin } from "./shared.ts";
import { graphApi as msGraphFetch, withMs as withMsToken } from "./microsoft.ts";

const PREFIX = "/make-server-3ba8d4df-2";

const AMOUNT_RE = /\$\s?([\d,]+\.\d{2})/;
const TOTAL_AMOUNT_RE = /(?:total\s*(?:due|amount|payable|incl(?:uding)?\.?\s*gst)?|amount\s*due|balance\s*due|grand\s*total|please\s*pay)\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/gi;
const ANY_AMOUNT_RE = /\$\s?([\d,]+\.\d{2})/g;

function extractInvoiceAmountCents(text: string): number | null {
  const keywordMatches = [...text.matchAll(TOTAL_AMOUNT_RE)].map((m) => Number(m[1].replace(/,/g, ""))).filter((n) => Number.isFinite(n) && n > 0);
  if (keywordMatches.length > 0) return Math.round(Math.max(...keywordMatches) * 100);
  const anyMatches = [...text.matchAll(ANY_AMOUNT_RE)].map((m) => Number(m[1].replace(/,/g, ""))).filter((n) => Number.isFinite(n) && n > 0);
  if (anyMatches.length > 0) return Math.round(Math.max(...anyMatches) * 100);
  return null;
}

const EXPENSE_CATEGORY_KEYWORDS: { category: string; re: RegExp }[] = [
  { category: "Utilities", re: /electricity|energy retailer|power bill|gas supply|origin energy|energyaustralia|\bagl\b/i },
  { category: "Telecom & Internet", re: /internet|broadband|telstra|optus|vodafone|\bnbn\b|phone plan/i },
  { category: "Rent", re: /\brent\b|lease payment|tenancy/i },
  { category: "Insurance", re: /insurance|policy premium/i },
  { category: "Ingredients & Supplies", re: /supplier|wholesale|produce|bakery supplies|coffee beans|dairy|butcher|grocer/i },
  { category: "Cleaning", re: /cleaning|hygiene service|pest control/i },
  { category: "Merchant & Bank Fees", re: /merchant fee|eftpos|transaction fee|bank fee|card surcharge/i },
  { category: "Rates & Council", re: /council rates|water rates|\bshire\b/i },
  { category: "Professional Services", re: /accountant|bookkeeping|legal fee|consulting/i },
  { category: "Equipment & Maintenance", re: /repair|maintenance|equipment hire|servicing/i },
  { category: "Marketing", re: /advertising|marketing|sponsor/i },
  { category: "Software & Subscriptions", re: /subscription|software|\bsaas\b|license fee/i },
];

async function guessExpenseCategory(db: any, text: string, filename: string): Promise<string> {
  const haystack = `${filename} ${text}`.toLowerCase();
  try {
    const { data } = await db.from("tt_expenses").select("category").limit(500);
    const existing = [...new Set((data ?? []).map((r: any) => (r.category as string)?.trim()).filter(Boolean))] as string[];
    for (const cat of existing) { const words = cat.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4); if (words.length > 0 && words.some((w: string) => haystack.includes(w))) return cat; }
  } catch { /* fall through to keyword map */ }
  for (const { category, re } of EXPENSE_CATEGORY_KEYWORDS) if (re.test(haystack)) return category;
  return "Uncategorised";
}

export function registerExpensesRoutes(app: Hono) {
  app.get(`${PREFIX}/manager/expenses/inbox-attachments`, async (c) => {
    const db = supabaseAdmin();
    const days = Math.min(Math.max(Number(c.req.query("days") ?? "30"), 1), 90);
    return withMsToken(c, db, async (token: string) => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const params = new URLSearchParams({ "$filter": `receivedDateTime ge ${since} and hasAttachments eq true`, "$select": "id,subject,from,receivedDateTime,bodyPreview,hasAttachments", "$orderby": "receivedDateTime desc", "$top": "50" });
      const body = await msGraphFetch(token, `/me/mailFolders/inbox/messages?${params.toString()}`);
      const messages: any[] = body.value ?? [];
      const { data: imported } = await db.from("tt_expenses").select("source_message_id, source_attachment_id").not("source_message_id", "is", null);
      const importedKeys = new Set((imported ?? []).map((r: any) => `${r.source_message_id}:${r.source_attachment_id}`));
      const candidates: any[] = [];
      for (const m of messages) {
        let attachments: any[] = [];
        try {
          const attBody = await msGraphFetch(token, `/me/messages/${encodeURIComponent(m.id)}/attachments?$select=id,name,contentType,size,isInline`);
          attachments = (attBody.value ?? []).filter((a: any) => !a.isInline && (a.contentType ?? "").toLowerCase().includes("pdf"));
        } catch (e) { console.warn("Failed to load attachments for", m.id, e); continue; }
        if (attachments.length === 0) continue;
        const text = `${m.subject ?? ""} ${m.bodyPreview ?? ""}`;
        const amountMatch = text.match(AMOUNT_RE);
        const suggestedAmountCents = amountMatch ? Math.round(Number(amountMatch[1].replace(/,/g, "")) * 100) : null;
        for (const a of attachments) {
          if (importedKeys.has(`${m.id}:${a.id}`)) continue;
          candidates.push({ messageId: m.id, attachmentId: a.id, filename: a.name, sizeKB: Math.round((a.size ?? 0) / 1024), subject: m.subject ?? "", from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "Unknown sender", receivedAt: m.receivedDateTime, preview: (m.bodyPreview ?? "").slice(0, 160), suggestedAmountCents });
        }
      }
      return c.json({ candidates });
    });
  });

  app.post(`${PREFIX}/manager/expenses/inbox-attachments/import`, async (c) => {
    const db = supabaseAdmin();
    const { messageId, attachmentId, description, category, amountCents } = await c.req.json();
    if (!messageId || !attachmentId) return c.json({ error: "messageId and attachmentId are required" }, 400);
    return withMsToken(c, db, async (token: string) => {
      const existing = await db.from("tt_expenses").select("id").eq("source_message_id", messageId).eq("source_attachment_id", attachmentId).maybeSingle();
      if (existing.data) return c.json({ error: "This attachment has already been imported" }, 409);
      const a = await msGraphFetch(token, `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
      if (!a.contentBytes) throw new Error("Attachment has no downloadable content");
      const filename = (a.name as string) || "attachment.pdf";
      const bytes = Uint8Array.from(atob(a.contentBytes), (ch) => ch.charCodeAt(0));
      const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${filename}`;
      const { error: upErr } = await db.storage.from("expenses").upload(storagePath, bytes, { contentType: a.contentType || "application/pdf" });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
      let pdfText = "";
      try { const pdf = await getDocumentProxy(bytes); const extracted = await extractText(pdf, { mergePages: true }); pdfText = Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text; }
      catch (e) { console.warn("PDF text extraction failed (non-fatal — falling back to hints)", e); }
      const detectedAmountCents = pdfText ? extractInvoiceAmountCents(pdfText) : null;
      const finalAmountCents = detectedAmountCents ?? (amountCents && amountCents > 0 ? amountCents : null);
      const detectedCategory = category || (pdfText ? await guessExpenseCategory(db, pdfText, filename) : "Uncategorised");
      const { data, error } = await db.from("tt_expenses").insert({ description: description || filename.replace(/\.pdf$/i, ""), category: detectedCategory, cost_type: "variable", amount_cents: finalAmountCents ?? 1, expense_date: new Date().toISOString().slice(0, 10), paid: false, attachment_storage_path: storagePath, attachment_filename: filename, source_message_id: messageId, source_attachment_id: attachmentId, created_by: "Email import" }).select().maybeSingle();
      if (error) throw new Error(error.message);
      return c.json({ expense: data, contentBytesBase64: a.contentBytes, filename, amountDetected: detectedAmountCents !== null, categoryDetected: detectedCategory !== "Uncategorised" });
    });
  });

  app.get(`${PREFIX}/manager/expenses/:id/attachment`, async (c) => {
    try {
      const id = Number(c.req.param("id"));
      const db = supabaseAdmin();
      const { data: expense, error } = await db.from("tt_expenses").select("attachment_storage_path, attachment_filename").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!expense?.attachment_storage_path) return c.json({ error: "No attachment on this expense" }, 404);
      const { data: signed, error: signErr } = await db.storage.from("expenses").createSignedUrl(expense.attachment_storage_path, 300);
      if (signErr) throw new Error(signErr.message);
      return c.json({ url: signed.signedUrl, filename: expense.attachment_filename });
    } catch (e) { console.error("expense attachment url failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });
}
