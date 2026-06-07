/**
 * Mock CRM event generator — intentionally produces dirty data
 * matching the take-home brief's edge cases.
 */

const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "http://localhost:3001/webhook/events";
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS ?? "2000", 10);

const STAGES = ["Discovery", "Qualification", "Negotiation", "Closed-Won", "Closed-Lost"] as const;
const EVENT_TYPES = [
  "deal_created",
  "stage_changed",
  "email_sent",
  "meeting_booked",
  "note_added",
  "close_date_changed",
  "deal_closed",
] as const;
const SOURCES = ["salesforce", "hubspot"] as const;

let eventCounter = 8800;

/** Seed deals with known dirty-data profiles from the brief */
const SEED_DEALS = [
  { deal_id: "D-9901", stage: "Discovery", amount: 500000, close_date: "2025-12-30", dirty: "no_activity" },
  { deal_id: "D-9902", stage: "Negotiation", amount: 12000, close_date: "2026-05-01", dirty: "stale_activity" },
  { deal_id: "D-9903", stage: "Closed-Won", amount: 250000, close_date: "2026-01-15", dirty: "closed_won_no_activity" },
  { deal_id: "D-9904", stage: "Discovery", amount: 80000, close_date: "2026-06-09", dirty: "close_date_mismatch" },
  { deal_id: "D-9905", stage: "Qualification", amount: 150000, close_date: "2026-08-15", dirty: "clean" },
  { deal_id: "D-9906", stage: "Negotiation", amount: 320000, close_date: "2026-07-01", dirty: "clean" },
];

function randomId(): string {
  return `evt_${++eventCounter}`;
}

function randomDeal() {
  if (Math.random() < 0.4) {
    return SEED_DEALS[Math.floor(Math.random() * SEED_DEALS.length)]!;
  }
  const id = `D-${9907 + Math.floor(Math.random() * 20)}`;
  return {
    deal_id: id,
    stage: STAGES[Math.floor(Math.random() * (STAGES.length - 2))]!,
    amount: Math.floor(Math.random() * 500000) + 10000,
    close_date: new Date(Date.now() + Math.random() * 180 * 86400000).toISOString().split("T")[0]!,
    dirty: "clean" as const,
  };
}

function generateEvent(): Record<string, unknown> {
  const deal = randomDeal();
  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)]!;
  const source = SOURCES[Math.floor(Math.random() * SOURCES.length)]!;

  // Duplicate source-of-truth conflict (~15% of events)
  const isDuplicate = Math.random() < 0.15;
  const isSourceOfTruth = isDuplicate ? Math.random() < 0.5 : true;

  const event: Record<string, unknown> = {
    event_id: randomId(),
    deal_id: deal.deal_id,
    type,
    stage: deal.stage,
    amount: deal.amount,
    close_date: deal.close_date,
    source,
    is_source_of_truth: isSourceOfTruth,
    occurred_at: new Date().toISOString(),
    payload: {},
  };

  // Apply dirty data patterns
  if (deal.dirty === "no_activity" || deal.dirty === "closed_won_no_activity") {
    if (type === "email_sent" || type === "meeting_booked") {
      // Skip activity events for these deals
      event.type = "stage_changed";
    }
  }

  if (deal.dirty === "stale_activity" && type === "email_sent") {
    event.occurred_at = new Date("2024-06-01T10:00:00Z").toISOString();
    event.payload = { subject: "Follow-up call notes", channel: "phone" };
  }

  if (type === "note_added") {
    const meddiccNotes = [
      "Champion: Sarah (VP Engineering) is actively advocating internally",
      "Economic buyer identified: CFO James Miller",
      "Metrics: $2M annual savings from automation",
      "Decision criteria: security compliance + ROI within 12 months",
      "Identified pain: manual reporting takes 40hrs/week",
      "Quick note from rep — need to follow up",
    ];
    event.payload = { note: meddiccNotes[Math.floor(Math.random() * meddiccNotes.length)] };
  }

  if (type === "email_sent") {
    event.payload = { subject: "Re: Proposal follow-up", to: "buyer@acme.com" };
  }

  if (type === "meeting_booked") {
    event.payload = { title: "Demo call", duration_minutes: 45 };
  }

  if (type === "close_date_changed") {
    // Push close date forward without stage change
    const pushed = new Date(Date.now() + Math.random() * 60 * 86400000);
    event.close_date = pushed.toISOString().split("T")[0];
    event.payload = { previous_close_date: deal.close_date, reason: "Customer requested extension" };
  }

  return event;
}

async function sendEvent(event: Record<string, unknown>, label = ""): Promise<void> {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    const body = await res.json();
    console.log(`[${label || "gen"}] ${res.status} ${event.event_id} → ${event.deal_id} (${event.type})`, body);
  } catch (err) {
    console.error(`[gen] Failed to send ${event.event_id}:`, err);
  }
}

async function seedInitialDeals(): Promise<void> {
  console.log("[gen] Seeding initial deals…");
  for (const deal of SEED_DEALS) {
    await sendEvent({
      event_id: randomId(),
      deal_id: deal.deal_id,
      type: "deal_created",
      stage: deal.stage,
      amount: deal.amount,
      close_date: deal.close_date,
      source: "salesforce",
      is_source_of_truth: true,
      occurred_at: new Date(Date.now() - 86400000 * 30).toISOString(),
      payload: { account_name: `Account for ${deal.deal_id}` },
    }, "seed");
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function sendDuplicate(event: Record<string, unknown>): Promise<void> {
  console.log(`[gen] Re-delivering duplicate: ${event.event_id}`);
  await sendEvent(event, "dupe");
}

async function main(): Promise<void> {
  console.log(`[gen] Sending events to ${WEBHOOK_URL} every ${INTERVAL_MS}ms`);

  // Wait for backend to be ready
  for (let i = 0; i < 30; i++) {
    try {
      const healthUrl = WEBHOOK_URL.replace("/webhook/events", "/health");
      const res = await fetch(healthUrl);
      if (res.ok) break;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  await seedInitialDeals();

  let lastEvent: Record<string, unknown> | null = null;
  let tick = 0;

  setInterval(async () => {
    tick++;
    const event = generateEvent();
    await sendEvent(event);
    lastEvent = event;

    // Every 10th tick, re-deliver the previous event (duplicate)
    if (tick % 10 === 0 && lastEvent) {
      await sendDuplicate(lastEvent);
    }

    // Every 15th tick, send an out-of-order event (occurred_at in the past)
    if (tick % 15 === 0) {
      const lateEvent = generateEvent();
      lateEvent.occurred_at = new Date(Date.now() - 86400000 * 7).toISOString();
      lateEvent.event_id = randomId();
      await sendEvent(lateEvent, "late");
    }
  }, INTERVAL_MS);
}

main().catch(console.error);
