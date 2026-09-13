import type { Hono } from "npm:hono";
import { supabaseAdmin, requireManagerPin, pinErrorStatus } from "./shared.ts";

const PREFIX = "/make-server-3ba8d4df-2";
const TRAINING_PASS_ATTEMPT_LIMIT = 3;
const DEFAULT_GRACE_PERIOD_DAYS = 3;

export function registerTrainingRoutes(app: Hono) {
  app.post(`${PREFIX}/manager/training`, async (c) => {
    try {
      const { pin, title, type, content, created_by, createdBy, mandatory, due_at, grace_period_days } = await c.req.json();
      const db = supabaseAdmin();
      await requireManagerPin(db, pin);
      if (!title || !type) return c.json({ error: "title and type are required" }, 400);
      const isMandatory = !!mandatory;
      if (isMandatory && (!due_at || Number.isNaN(new Date(due_at).getTime()))) return c.json({ error: "A valid deadline is required for mandatory training" }, 400);
      const gracePeriod = Number.isFinite(grace_period_days) && grace_period_days > 0 ? grace_period_days : DEFAULT_GRACE_PERIOD_DAYS;
      const { data, error } = await db.from("tt_trainings").insert({
        title, type, content: content ?? {}, created_by: created_by ?? createdBy ?? null,
        mandatory: isMandatory, mandatory_since: isMandatory ? new Date().toISOString() : null, due_at: isMandatory ? due_at : null, grace_period_days: gracePeriod, updated_at: new Date().toISOString(),
      }).select().maybeSingle();
      if (error) throw new Error(error.message);
      return c.json({ training: data });
    } catch (e) { console.error("training create failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, pinErrorStatus(e)); }
  });

  app.put(`${PREFIX}/manager/training/:id`, async (c) => {
    try {
      const id = Number(c.req.param("id"));
      const { pin, title, type, content, mandatory, due_at, grace_period_days } = await c.req.json();
      const db = supabaseAdmin();
      await requireManagerPin(db, pin);
      const { data: existing, error: exErr } = await db.from("tt_trainings").select("mandatory, mandatory_since, due_at").eq("id", id).maybeSingle();
      if (exErr) throw new Error(exErr.message);
      if (!existing) return c.json({ error: "Training not found" }, 404);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (title !== undefined) patch.title = title;
      if (type !== undefined) patch.type = type;
      if (content !== undefined) patch.content = content;
      if (Number.isFinite(grace_period_days) && grace_period_days > 0) patch.grace_period_days = grace_period_days;
      if (due_at !== undefined) patch.due_at = due_at || null;
      if (mandatory !== undefined) {
        patch.mandatory = !!mandatory;
        if (mandatory) {
          const effectiveDueAt = due_at ?? existing.due_at;
          if (!effectiveDueAt || Number.isNaN(new Date(effectiveDueAt).getTime())) return c.json({ error: "A valid deadline is required for mandatory training" }, 400);
          if (!existing?.mandatory || !existing?.mandatory_since) patch.mandatory_since = new Date().toISOString();
        } else { patch.mandatory_since = null; patch.due_at = null; }
      }
      const { data, error } = await db.from("tt_trainings").update(patch).eq("id", id).select().maybeSingle();
      if (error) throw new Error(error.message);
      return c.json({ training: data });
    } catch (e) { console.error("training update failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, pinErrorStatus(e)); }
  });

  app.delete(`${PREFIX}/manager/training/:id`, async (c) => {
    try {
      const id = Number(c.req.param("id"));
      const pin = c.req.query("pin");
      const db = supabaseAdmin();
      await requireManagerPin(db, pin);
      const { error: compErr } = await db.from("tt_training_completions").delete().eq("training_id", id);
      if (compErr) throw new Error(compErr.message);
      const { error } = await db.from("tt_trainings").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return c.json({ ok: true });
    } catch (e) { console.error("training delete failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, pinErrorStatus(e)); }
  });

  app.post(`${PREFIX}/training/attempt`, async (c) => {
    try {
      const { teamId, trainingId, answers } = await c.req.json();
      if (!teamId || !trainingId) return c.json({ error: "teamId and trainingId are required" }, 400);
      const db = supabaseAdmin();
      const [{ data: member, error: memberErr }, { data: training, error: trainingErr }] = await Promise.all([
        db.from("tt_team").select("id").eq("id", teamId).maybeSingle(),
        db.from("tt_trainings").select("id, type, content").eq("id", trainingId).maybeSingle(),
      ]);
      if (memberErr) throw new Error(memberErr.message);
      if (trainingErr) throw new Error(trainingErr.message);
      if (!member || !training) return c.json({ error: "Team member or training not found" }, 404);
      const { data: existing, error: existingErr } = await db.from("tt_training_completions").select("*").eq("training_id", trainingId).eq("team_id", teamId).maybeSingle();
      if (existingErr) throw new Error(existingErr.message);
      if (existing?.locked) return c.json({ error: "You've hit the attempt limit for this quiz — ask a manager to reset it.", completion: existing }, 403);
      if (existing?.passed) return c.json({ completion: existing, attemptsRemaining: null });
      const questions = Array.isArray(training.content?.questions) ? training.content.questions : [];
      const isQuiz = training.type === "quiz";
      if (isQuiz && (!answers || typeof answers !== "object" || questions.length === 0)) return c.json({ error: "Quiz answers are required" }, 400);
      const total = isQuiz ? questions.length : null;
      const score = isQuiz ? questions.reduce((sum: number, q: any, index: number) => sum + (Number(answers[index]) === Number(q.correctIndex) ? 1 : 0), 0) : null;
      const passed = isQuiz ? total! > 0 && score === total : true;
      const attempts = (existing?.attempts ?? 0) + 1;
      const locked = isQuiz && !passed && attempts >= TRAINING_PASS_ATTEMPT_LIMIT;
      const { data, error } = await db.from("tt_training_completions").upsert({ training_id: trainingId, team_id: teamId, score, total, passed, attempts, locked, completed_at: new Date().toISOString() }, { onConflict: "training_id,team_id" }).select().maybeSingle();
      if (error) throw new Error(error.message);
      return c.json({ completion: data, attemptsRemaining: passed ? null : Math.max(0, TRAINING_PASS_ATTEMPT_LIMIT - attempts), locked });
    } catch (e) { console.error("training attempt failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  app.post(`${PREFIX}/manager/training/reset`, async (c) => {
    try {
      const { pin, teamId, trainingId } = await c.req.json();
      if (!teamId || !trainingId) return c.json({ error: "teamId and trainingId are required" }, 400);
      const db = supabaseAdmin();
      await requireManagerPin(db, pin);
      const { data, error } = await db.from("tt_training_completions").update({ attempts: 0, locked: false }).eq("training_id", trainingId).eq("team_id", teamId).select().maybeSingle();
      if (error) throw new Error(error.message);
      return c.json({ completion: data ?? null });
    } catch (e) { console.error("training reset failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, pinErrorStatus(e)); }
  });
}
