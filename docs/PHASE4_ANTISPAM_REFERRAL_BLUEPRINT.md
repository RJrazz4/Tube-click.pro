# PHASE 4 BLUEPRINT — The Anti-Spam 2-Node Viral Referral Engine

**Status:** DRAFT — awaiting business-logic sign-off. No implementation has begun.
**Predecessor arc:** Ghost Intelligence v3 (Micro-Phases 1-7), closed at `608f6eb`.
**Author:** Lead Full-Stack SaaS Architect
**Date:** 2026-08-13

---

## 0. Purpose of this document

This is a **requirements-gathering and design** document, not an execution plan.
It exists because a survey of the repository found that a substantial referral
system **already ships in production**, and the requested feature name conflicts
with it in at least one material way. Building before resolving those conflicts
would risk silently changing the economics of a live growth loop.

Every open decision is tagged **[DECISION-n]**. Every assumption I have made in
order to produce a coherent draft is tagged **[ASSUMPTION-n]** and is intended to
be overridden. Nothing in section 5 onward should be treated as agreed.

---

## 1. What already exists (audited, not assumed)

The following is present on `main` today. This matters because the new arc is
described as an *engine* — implying replacement — while the existing system is
already load-bearing for Pro entitlement.

### 1.1 Schema

Three migrations own the referral surface:

- `202607210001_phase5_referrals.sql`
- `202607210003_qualified_referral_chain.sql`
- `202607210004_referral_dashboard_authenticated_access.sql`

`referral_profiles` holds one row per user, carrying a unique 12-character
referral code (`TC_` + 8 hex chars, generated from `gen_random_bytes`), plus
denormalised counters: `verified_referrals`, `friends_unlocked_pro`,
`pro_unlocked_at`, `pro_tier_expires_at`.

`referral_events` is the append-only attribution log: `referrer_id`,
`ref_code`, `referred_user_id`, `ip_hash`, `event_type` (`click` | `signup`),
`status` (`pending` | `verified` | `flagged`), and timestamps.

### 1.2 Anti-abuse controls already enforced

These are enforced **in the database**, inside `SECURITY DEFINER` functions, not
in application code — meaning they cannot be bypassed from the client:

1. **Self-referral block.** `profile_row.user_id = p_referred_user_id` is
   rejected outright.
2. **Disposable-email block.** A hardcoded domain array (mailinator, tempmail,
   temp-mail, guerrillamail, 10minutemail, yopmail, throwawaymail) is rejected
   and the attempt is written as `flagged`.
3. **Single-attribution invariant.** A partial unique index on
   `referred_user_id` makes it physically impossible for one invitee to be
   attributed to two referrers.
4. **Network-duplicate block.** A partial unique index on
   `(referrer_id, ip_hash)` where `status = 'verified'` means one referrer
   cannot bank two verified signups from the same IP. Repeat attempts are
   recorded as `flagged` rather than silently dropped.
5. **Row-level security.** Users may `select` their own aggregate profile only.
   `referral_events` is fully revoked from `anon` and `authenticated` — all
   access is server-side.
6. **Seed escape hatch.** `admin_grant_seed_pro` is granted to `service_role`
   only and explicitly revoked from `public`, `anon`, `authenticated`.

### 1.3 Qualification logic already in force

`evaluate_qualified_referral_chain(p_user_id, p_depth)` grants Pro only when
**both** conditions hold:

```
invite_count            >= 3      -- three verified invites
unlocked_friend_count   >= 1      -- at least one of whom unlocked Pro themselves
```

Signup alone never grants Pro. The existing test suite
(`tests/qualified-referral-chain.test.ts`) explicitly asserts this and asserts
the absence of a signup-time grant.

### 1.4 Frontend surface

Ten-plus components already consume this: `ReferralCapture`, `Rewards`,
`ReferralLeaderboardGhost`, `ReferralMilestones`, `ReferralPromoArtifact`,
`ReferralShareActions`, `ViralGrowthPass`, `ViralOverdriveMiniBanner`,
`ProExpiryCountdown`, plus `src/lib/referrals/{client,promo}.ts`.

---

## 2. The naming conflict that must be resolved first

> **[DECISION-1] — What does "2-Node" mean, given the live system requires 3 invites?**

The production rule is **3 verified invites + 1 friend who unlocked Pro**. The
requested feature is a **2-Node** engine. These are not the same shape, and the
difference is not cosmetic — it changes how much work a user must do to earn Pro,
which directly moves both viral coefficient and margin.

Candidate readings, each with a different consequence:

| Reading | Meaning | Consequence if chosen |
|---|---|---|
| **A. Depth semantics** | "2 nodes" = referrer + invitee; attribution depth 1; no multi-level payout | Closest to current behaviour. `p_depth` already exists and is passed `0`. Mostly a *hardening* arc, not a rewrite. |
| **B. Threshold change** | Lower the bar from 3 invites to 2 | Direct economics change. Cheaper Pro, higher velocity, higher abuse incentive. Requires migration of in-flight progress. |
| **C. Two-sided reward** | Both referrer *and* invitee are rewarded ("2 nodes paid") | New payout path; current system rewards only the referrer. |
| **D. Two-hop chain** | Referrer earns from invitee *and* invitee's invitee | This is multi-level. Materially raises fraud incentive and is the hardest to police. |

I will not guess between these. **Reading A** is the most defensible technically
and the least disruptive commercially, so the draft below assumes it — but a
one-word correction from you changes the entire arc.

**[ASSUMPTION-1]** Reading A: 2-Node = depth-1 attribution, referrer + invitee,
with node 3 explicitly non-earning.

---

## 3. Remaining open decisions

> **[DECISION-2] — What is the qualification trigger?**

Today: verified signup counts toward `invite_count`, but Pro requires a friend
to independently unlock Pro. Options, ordered by fraud-resistance:

1. Signup only — weakest; farmable at near-zero cost.
2. Email verification — weak; disposable domains are a moving target and the
   current blocklist is a static array of seven domains.
3. **First successful generation** — proves a human did real work; costs the
   attacker real compute to fake.
4. **Paid conversion** — strongest; fraud becomes unprofitable by construction.

**[ASSUMPTION-2]** Qualification = first successful generation by the invitee,
retaining the existing "friend must reach a real milestone" spirit while being
cheaper to reach than full Pro unlock.

> **[DECISION-3] — Threat model and enforcement action.**

Which adversary are we actually funding defence against?

- **T1 — Casual self-referral.** One user, a second email. *Partially covered*
  by the self-referral and IP-uniqueness checks.
- **T2 — Single-human account farming.** One person, many identities, varied
  IPs (mobile tethering, cheap proxies). *Not covered.* The IP index is trivially
  defeated by rotating networks.
- **T3 — Coordinated rings.** N real humans reciprocally referring each other.
  *Not covered at all,* and invisible to per-account heuristics because every
  individual signal looks legitimate. Detection requires graph analysis —
  reciprocity, cycle detection, and cluster density over the referral graph.
- **T4 — Automated/scripted signup.** *Not covered;* there is no proof-of-work,
  CAPTCHA, or rate limit on the capture path.

Enforcement is a separate axis from detection, and needs its own answer:

- **Silent no-credit** (shadow-deny) — attacker gets no feedback signal, so
  they cannot iterate against the detector. Best anti-abuse property; risks
  quietly punishing false positives.
- **Hard block** — clear and honest; also tells the attacker exactly which
  probe failed, which accelerates evasion.
- **Manual review queue** — highest precision, requires human operational time
  and does not scale without staffing.

The existing code already implements a *de facto* shadow-deny by writing
`flagged` rows and returning a reason — worth noting that the reason string is
returned to the client, which leaks detector state.

**[ASSUMPTION-3]** Defend primarily against T2 and T3; enforce via silent
no-credit plus a `flagged` review queue for high-value cases; stop returning
granular rejection reasons to the client.

> **[DECISION-4] — Reward economics.**

Currently the reward is Pro time, tracked via `pro_unlocked_at` and
`pro_tier_expires_at`. With the Ghost credit ledger now shipped (MP2), Ghost
credits are a newly available and more granular currency.

Unspecified and required:
- Payout to the **referrer**, and separately to the **invitee** (if two-sided).
- Whether the currency is Ghost credits, Pro days, or cash.
- **Lifetime cap per referrer** — without a cap, any positive payout is an
  unbounded liability. The current design is implicitly capped because Pro
  unlock is a one-time boolean; a credit-based reward would not be.

**[ASSUMPTION-4]** Reward is Pro days for the referrer with a hard lifetime cap,
denominated so that worst-case payout is bounded and known in advance.

> **[DECISION-5] — Extend or replace?**

Given ~1,000 lines of live SQL, ten frontend components, and existing users
mid-progress, I strongly recommend **extend**. A replacement requires a
backfill/migration story for users who have already banked invites, and risks
retroactively revoking entitlements — a support and trust problem far more
expensive than the engineering saved.

**[ASSUMPTION-5]** Extend the existing system. No destructive migration. Any
threshold change applies forward, with in-flight progress grandfathered.

---

## 4. Recommended technical direction (conditional on the above)

Stated only to show the shape of the work; not a commitment.

The genuinely new capability is **graph-aware fraud detection**, because that is
the one class of abuse (T3) that no amount of per-row validation can catch. That
implies:

- A materialised view of the referral graph, refreshed on a schedule rather than
  per-request, keeping detection off the signup hot path.
- Reciprocity and cycle detection over that graph — A→B→A and longer rings.
- Cluster-density scoring — a legitimate creator's invitees are weakly connected
  to each other; a ring's members are densely interconnected.
- A composite trust score per referral event, with the payout decision reading
  the score rather than re-deriving heuristics inline.
- Velocity limits keyed on something more durable than IP, since IP rotation is
  the cheapest evasion available.

Carried forward from MP7, non-negotiable for this arc:

- All mutations stay inside `SECURITY DEFINER` routines; the client is never
  trusted for attribution or payout.
- Identity resolution goes through the unified `api/_ghostAuth.ts` layer. No
  module re-implements its own `verifyAuth()` — that is exactly the drift that
  produced the MP7 auth bypass.
- Detection work stays off the request-critical path so referral capture does
  not regress the latency budgets set in the Ghost arc.

---

## 5. What I need from you

Answer **[DECISION-1]** through **[DECISION-5]**. DECISION-1 is blocking — the
other four can be refined during implementation, but the meaning of "2-Node"
determines the schema, the economics, and the fraud surface.

On receipt I will produce the executable micro-phase breakdown, each phase
independently shippable behind a feature flag with its own verification gate,
in the same format as the Ghost Intelligence arc.

---

## 6. Progress log

| Phase | Commit | Description | Status |
|---|---|---|---|
| 0 (Blueprint) | — | Requirements audit of live referral system; five decisions surfaced; naming conflict with existing 3-invite rule identified | ⏳ awaiting sign-off |
