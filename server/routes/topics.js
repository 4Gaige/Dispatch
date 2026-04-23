/**
 * Phase 4 — topic API.
 *
 * Endpoints (all under /api/topics, gated by authenticateToken in server/index.js):
 *
 *   GET  /                       List all assignments + per-project topic summaries.
 *   GET  /project/:slug          Same shape, scoped to one project.
 *   POST /assign                 Manual override (body: sessionId, projectKey, topic).
 *                                Pass topic=null to clear an existing manual tag.
 *   POST /cluster                Trigger a one-off full re-cluster (admin / debug).
 *   POST /cluster/project/:slug  Trigger re-cluster for one project.
 *
 * Manual assignments persist with method='manual' and survive automatic runs.
 * Bodies are validated minimally — these are authenticated-user endpoints.
 */

import express from 'express';

import { topicStore } from '../database/topic-store.js';
import {
  setManualTopic,
  clusterAllProjects,
  clusterLargeProject,
  backfillSmallProject,
  tagSessionWithHaiku,
} from '../services/topic-clusterer.js';

const router = express.Router();

const MAX_SLUG_LEN = 200;
const MAX_SESSION_ID_LEN = 80;
const MAX_TOPIC_LEN = 80;
// Re-cluster runs hit Haiku once per cluster (and Voyage once for embeds),
// so a hot endpoint is a real billing risk. One full re-cluster per hour is
// plenty for an interactive debug button.
const CLUSTER_THROTTLE_MS = 60 * 60 * 1000;
const clusterThrottle = { lastRunAt: 0 };

function safeSlug(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_SLUG_LEN) return null;
  if (trimmed.includes('/') || trimmed.includes('..') || trimmed.includes('\0')) return null;
  return trimmed;
}

function safeSessionId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_SESSION_ID_LEN) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return null;
  return trimmed;
}

function safeTopic(value) {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: 'topic must be a string or null' };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > MAX_TOPIC_LEN) {
    return { ok: false, error: `topic must be at most ${MAX_TOPIC_LEN} characters` };
  }
  if (/[\n\r\0]/.test(trimmed)) return { ok: false, error: 'topic must be a single line' };
  return { ok: true, value: trimmed };
}

function buildProjectSummary(slug) {
  const topics = topicStore.getTopicsForProject(slug);
  const assignments = topicStore.getForProject(slug);
  const assignmentMap = {};
  for (const a of assignments) {
    assignmentMap[a.sessionId] = { topic: a.topic, accent: a.accent, method: a.method };
  }
  return { topics, assignments: assignmentMap };
}

router.get('/', (_req, res) => {
  try {
    const all = topicStore.getAll();
    const byProject = {};
    for (const a of all) {
      const bucket =
        byProject[a.projectKey] ||
        (byProject[a.projectKey] = { topics: [], assignments: {} });
      bucket.assignments[a.sessionId] = {
        topic: a.topic,
        accent: a.accent,
        method: a.method,
      };
    }
    for (const slug of Object.keys(byProject)) {
      byProject[slug].topics = topicStore.getTopicsForProject(slug);
    }
    res.json({ byProject });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch topics', detail: err.message });
  }
});

router.get('/project/:slug', (req, res) => {
  const slug = safeSlug(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'Invalid project slug' });
  try {
    res.json(buildProjectSummary(slug));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project topics', detail: err.message });
  }
});

router.post('/assign', (req, res) => {
  const { sessionId, projectKey, topic } = req.body || {};
  const safeSession = safeSessionId(sessionId);
  if (!safeSession) {
    return res.status(400).json({ error: 'sessionId is required (alphanumeric, ._-, ≤80 chars)' });
  }
  const slug = safeSlug(projectKey);
  if (!slug) {
    return res.status(400).json({ error: 'projectKey (slug) is required (≤200 chars)' });
  }
  const topicCheck = safeTopic(topic ?? null);
  if (!topicCheck.ok) {
    return res.status(400).json({ error: topicCheck.error });
  }
  try {
    const result = setManualTopic({
      sessionId: safeSession,
      slug,
      topic: topicCheck.value,
    });
    res.json({ ok: true, result, project: buildProjectSummary(slug) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign topic', detail: err.message });
  }
});

router.post('/cluster', async (_req, res) => {
  const now = Date.now();
  const sinceLast = now - clusterThrottle.lastRunAt;
  if (sinceLast < CLUSTER_THROTTLE_MS) {
    return res.status(429).json({
      error: 'Re-cluster throttled',
      retryAfterMs: CLUSTER_THROTTLE_MS - sinceLast,
    });
  }
  clusterThrottle.lastRunAt = now;
  try {
    const summary = await clusterAllProjects();
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(500).json({ error: 'Cluster run failed', detail: err.message });
  }
});

router.post('/cluster/project/:slug', async (req, res) => {
  const slug = safeSlug(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'Invalid project slug' });
  try {
    let result;
    const force = String(req.query.large || '').toLowerCase() === 'true';
    if (force) {
      result = await clusterLargeProject(slug);
    } else {
      const tagged = await backfillSmallProject(slug);
      result = { method: 'haiku', taggedCount: tagged };
    }
    res.json({ ok: true, slug, result, project: buildProjectSummary(slug) });
  } catch (err) {
    res.status(500).json({ error: 'Project cluster run failed', detail: err.message });
  }
});

router.post('/tag/session', async (req, res) => {
  const { sessionId, projectKey, overrideManual } = req.body || {};
  const safeSession = safeSessionId(sessionId);
  const slug = safeSlug(projectKey);
  if (!safeSession || !slug) {
    return res.status(400).json({
      error: 'sessionId (alphanumeric/._-, ≤80) and projectKey (slug, ≤200) required',
    });
  }
  // Refuse to silently destroy a manual tag. Caller must opt in explicitly.
  const existing = topicStore.getForSession(safeSession, 'claude');
  if (existing && existing.method === 'manual' && overrideManual !== true) {
    return res.status(409).json({
      error: 'Session has a manual topic; pass overrideManual:true to overwrite.',
      currentTopic: existing.topic,
    });
  }
  try {
    // Forcing here is now safe because we already gated manual above.
    const topic = await tagSessionWithHaiku({ sessionId: safeSession, slug, force: true });
    res.json({ ok: true, sessionId: safeSession, topic, project: buildProjectSummary(slug) });
  } catch (err) {
    res.status(500).json({ error: 'Tag failed', detail: err.message });
  }
});

export default router;
