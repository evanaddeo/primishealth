/**
 * ManualInputContextBuilder (CU-080) — spec §10.6, §13.8 (AI-SAFE-008).
 *
 * Surfaces recent user-entered context: daily check-ins (mood / energy / stress /
 * soreness / fatigue), hydration / caffeine / alcohol totals, custom tags, and a
 * non-diagnostic digestion trend. Manual inputs are treated as *context*, never as
 * dominant score inputs (AI-SAFE-008), and digestion is discussed for pattern
 * awareness only — never a GI diagnosis (§13.8). Raw free-text notes are NOT
 * dumped into the packet; only a bounded count is carried.
 *
 * TODO(phase-h): hydration/caffeine/alcohol/bowel read paths are populated by
 * Phase H. Until it merges this builder is exercised against the Phase-D repos +
 * fixtures via its port and is kept out of live wiring (CU-082/083 confirm data).
 */

import type { AiConfidence, AiEvidence } from '@primis/api-contracts';

import { assertNoRawContent } from '../AiContextPacket.js';
import type { ContextBuilder, ContextBuilderInput, ContextBuilderResult } from '../contextTypes.js';

import { maxConfidence, round } from './builderUtils.js';
import type { BuilderClockOptions } from './types.js';

const DOMAIN = 'manual_inputs' as const;
const DIGESTION_DOMAIN = 'gut_digestion' as const;
const TAGS_DOMAIN = 'custom_tags' as const;

/** Bounds keeping the packet compact (never a full manual-input history). */
const MAX_CHECKINS = 7;
const MAX_DIGESTION_ENTRIES = 7;
const MAX_TAGS = 10;

/** Standard non-diagnostic caveat for digestion tracking (§13.8). */
const DIGESTION_CAVEAT =
  'Digestion tracking is for pattern awareness only, not a diagnosis — discuss persistent or severe symptoms with a clinician.';

// ---------------------------------------------------------------------------
// Read models + port
// ---------------------------------------------------------------------------

/** A daily subjective check-in (scale values, never free-text notes). */
export interface CheckinReadModel {
  localDate: string;
  mood?: number | null;
  energy?: number | null;
  stress?: number | null;
  soreness?: number | null;
  fatigue?: number | null;
}

/** A non-diagnostic digestion entry (Bristol type + coarse descriptors). */
export interface DigestionEntryReadModel {
  localDate: string;
  bristolType?: number | null;
  urgency?: 'low' | 'normal' | 'high' | 'unknown';
  bloating?: boolean;
  pain?: boolean;
}

/** A custom tag the user applies, with how often it appeared in range. */
export interface CustomTagReadModel {
  tag: string;
  count: number;
}

/** Normalized manual-input context the {@link ManualInputDataPort} returns. */
export interface ManualInputReadModel {
  localDate: string;
  checkins: CheckinReadModel[];
  hydrationMl?: number | null;
  caffeineMg?: number | null;
  alcoholUnits?: number | null;
  digestion?: {
    entryCount?: number | null;
    recentEntries: DigestionEntryReadModel[];
    bristolTrend?: 'firmer' | 'looser' | 'stable' | 'unknown';
  };
  customTags: CustomTagReadModel[];
  /** Count of free-text notes in range — raw text is never carried. */
  noteCount?: number | null;
}

/** Options narrowing a manual-input query. */
export interface ManualInputQueryOptions {
  asOfLocalDate?: string;
}

/** Read-only port supplying recent manual inputs. */
export interface ManualInputDataPort {
  getManualInputContext(
    userId: string,
    options: ManualInputQueryOptions,
  ): Promise<ManualInputReadModel | undefined>;
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface CheckinSummary {
  localDate: string;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  soreness: number | null;
  fatigue: number | null;
}

export interface DigestionSummary {
  entryCount: number | null;
  bristolTrend: 'firmer' | 'looser' | 'stable' | 'unknown';
  recentEntries: Array<{
    localDate: string;
    bristolType: number | null;
    urgency: 'low' | 'normal' | 'high' | 'unknown';
    bloating: boolean;
    pain: boolean;
  }>;
}

/** Compact payload produced by {@link ManualInputContextBuilder}. */
export interface ManualInputContextPayload {
  localDate: string;
  medicalInterpretation: false;
  checkins: CheckinSummary[];
  hydrationMl: number | null;
  caffeineMg: number | null;
  alcoholUnits: number | null;
  digestion: DigestionSummary | null;
  customTags: CustomTagReadModel[];
  noteCount: number | null;
  caveats: string[];
}

export class ManualInputContextBuilder implements ContextBuilder<ManualInputContextPayload> {
  readonly domain = DOMAIN;

  constructor(
    private readonly port: ManualInputDataPort,
    private readonly options: BuilderClockOptions = {},
  ) {}

  async build(
    input: ContextBuilderInput,
  ): Promise<ContextBuilderResult<ManualInputContextPayload>> {
    void this.options;
    const asOfLocalDate = input.timeRange.endDate ?? input.timeRange.startDate;
    const query: ManualInputQueryOptions = {};
    if (asOfLocalDate) query.asOfLocalDate = asOfLocalDate;
    const model = await this.port.getManualInputContext(input.userId, query);

    const evidence: AiEvidence[] = [];
    const limitations: string[] = [];
    const caveats: string[] = ['Manual inputs are context, not a diagnosis or a computed score.'];

    if (!model) {
      const payload: ManualInputContextPayload = {
        localDate: asOfLocalDate ?? 'latest',
        medicalInterpretation: false,
        checkins: [],
        hydrationMl: null,
        caffeineMg: null,
        alcoholUnits: null,
        digestion: null,
        customTags: [],
        noteCount: null,
        caveats,
      };
      assertNoRawContent(payload);
      return {
        domain: this.domain,
        payload,
        evidence: [],
        limitations: ['No manual inputs available for the requested range.'],
        completeness: 0,
        confidence: 'not_enough_data',
      };
    }

    // --- Check-ins -----------------------------------------------------------
    const checkins = model.checkins.slice(0, MAX_CHECKINS).map((c) => this.summarizeCheckin(c));
    const latest = checkins[0];
    if (latest) {
      const parts: string[] = [];
      if (latest.mood !== null) parts.push(`mood ${latest.mood}`);
      if (latest.energy !== null) parts.push(`energy ${latest.energy}`);
      if (latest.stress !== null) parts.push(`stress ${latest.stress}`);
      if (parts.length > 0) {
        evidence.push({
          id: 'ev_latest_checkin',
          type: 'manual_input',
          domain: DOMAIN,
          statement: `Latest check-in (${latest.localDate}): ${parts.join(', ')}.`,
          confidence: 'low',
          source: 'manual_input',
          rangeStart: latest.localDate,
          rangeEnd: latest.localDate,
        });
      }
    } else {
      limitations.push('No recent check-ins recorded.');
    }

    // --- Hydration / caffeine / alcohol -------------------------------------
    this.pushManual(
      evidence,
      model,
      'hydration',
      'water_intake_ml',
      model.hydrationMl,
      'ml',
      (v) => `Hydration logged: ${v} ml.`,
    );
    this.pushManual(
      evidence,
      model,
      'caffeine',
      'caffeine_mg',
      model.caffeineMg,
      'mg',
      (v) => `Caffeine logged: ${v} mg.`,
    );
    this.pushManual(
      evidence,
      model,
      'alcohol',
      'alcohol_units',
      model.alcoholUnits,
      'units',
      (v) => `Alcohol logged: ${v} unit(s).`,
    );

    // --- Custom tags ---------------------------------------------------------
    const tags = [...model.customTags]
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, MAX_TAGS);
    if (tags.length > 0) {
      const top = tags
        .slice(0, 3)
        .map((t) => `${t.tag} (${t.count})`)
        .join(', ');
      evidence.push({
        id: 'ev_custom_tags',
        type: 'custom_tag',
        domain: TAGS_DOMAIN,
        statement: `Most frequent tags in range: ${top}.`,
        confidence: 'low',
        source: 'manual_input',
      });
    }

    // --- Digestion (non-diagnostic) -----------------------------------------
    const digestion = this.summarizeDigestion(model);
    if (digestion) {
      caveats.push(DIGESTION_CAVEAT);
      if (digestion.entryCount && digestion.entryCount > 0) {
        evidence.push({
          id: 'ev_digestion_trend',
          type: 'trend',
          domain: DIGESTION_DOMAIN,
          statement: `Digestion entries in range: ${digestion.entryCount}; Bristol trend is ${digestion.bristolTrend}.`,
          confidence: 'low',
          source: 'manual_input',
          direction: this.trendDirection(digestion.bristolTrend),
        });
      }
    }

    const payload: ManualInputContextPayload = {
      localDate: model.localDate,
      medicalInterpretation: false,
      checkins,
      hydrationMl: round(model.hydrationMl, 0),
      caffeineMg: round(model.caffeineMg, 0),
      alcoholUnits: round(model.alcoholUnits, 1),
      digestion,
      customTags: tags,
      noteCount: round(model.noteCount, 0),
      caveats,
    };
    assertNoRawContent(payload);

    return {
      domain: this.domain,
      payload,
      evidence,
      limitations,
      completeness: this.completeness(checkins.length, model, digestion),
      confidence: this.aggregateConfidence(evidence),
    };
  }

  private summarizeCheckin(c: CheckinReadModel): CheckinSummary {
    return {
      localDate: c.localDate,
      mood: round(c.mood, 0),
      energy: round(c.energy, 0),
      stress: round(c.stress, 0),
      soreness: round(c.soreness, 0),
      fatigue: round(c.fatigue, 0),
    };
  }

  private summarizeDigestion(model: ManualInputReadModel): DigestionSummary | null {
    const d = model.digestion;
    if (!d) return null;
    return {
      entryCount: round(d.entryCount, 0),
      bristolTrend: d.bristolTrend ?? 'unknown',
      recentEntries: d.recentEntries.slice(0, MAX_DIGESTION_ENTRIES).map((e) => ({
        localDate: e.localDate,
        bristolType: round(e.bristolType, 0),
        urgency: e.urgency ?? 'unknown',
        bloating: e.bloating ?? false,
        pain: e.pain ?? false,
      })),
    };
  }

  private pushManual(
    evidence: AiEvidence[],
    model: ManualInputReadModel,
    domain: 'hydration' | 'caffeine' | 'alcohol',
    metricCode: string,
    value: number | null | undefined,
    unit: string,
    statement: (v: number) => string,
  ): void {
    if (value === null || value === undefined) return;
    const rounded = round(value, 1) ?? value;
    evidence.push({
      id: `ev_${metricCode}`,
      type: 'manual_input',
      domain,
      statement: statement(rounded),
      metricCode,
      value: rounded,
      unit,
      confidence: 'medium',
      source: 'manual_input',
      rangeStart: model.localDate,
      rangeEnd: model.localDate,
    });
  }

  private trendDirection(
    trend: NonNullable<DigestionSummary['bristolTrend']>,
  ): AiEvidence['direction'] {
    if (trend === 'firmer') return 'up';
    if (trend === 'looser') return 'down';
    if (trend === 'stable') return 'stable';
    return 'unknown';
  }

  private completeness(
    checkinCount: number,
    model: ManualInputReadModel,
    digestion: DigestionSummary | null,
  ): number {
    let have = 0;
    const total = 3;
    if (checkinCount > 0) have += 1;
    if (model.hydrationMl != null || model.caffeineMg != null || model.alcoholUnits != null)
      have += 1;
    if (digestion || model.customTags.length > 0) have += 1;
    return Math.round((have / total) * 100) / 100;
  }

  private aggregateConfidence(evidence: AiEvidence[]): AiConfidence {
    if (evidence.length === 0) return 'not_enough_data';
    let best: AiConfidence = 'not_enough_data';
    for (const ev of evidence) best = maxConfidence(best, ev.confidence);
    return best;
  }
}
