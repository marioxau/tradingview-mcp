/**
 * Vault-Powered Bull/Bear Debate Engine
 *
 * Inspired by TauricResearch TradingAgents debate mechanism,
 * but grounded entirely in the IC SOLUTIONZ vault:
 *   - 37 ICT/SMC strategies as the analytical framework
 *   - 18 confluence gates as the debate rulebook
 *   - Kill zone enforcement as the arbiter override
 *
 * Architecture (mirrors TauricResearch 5-phase pipeline):
 *   1. Bull Analyst  → finds strongest LONG evidence using vault
 *   2. Bear Analyst  → finds strongest SHORT/SKIP evidence using vault
 *   3. Debate (N rounds) → structured back-and-forth on same data
 *   4. Vault Arbiter → ICT-rules-based final decision
 *   5. VaultDecision → typed output with gate citations
 */

import { scoreConfluence } from './confluence.js';
import { detectStrategies } from './strategy_detector.js';
import { checkSymbolRulesAndKillZone } from './rules.js';
import { analyzeMultiframe } from './multiframe.js';
import { detectPatterns } from './patterns.js';

// ─── BULL ANALYST ───────────────────────────────────────────────────────────

function runBullAnalyst(params) {
  const { chart, indicators, quote, symbol, timeframe, multiframe_data } = params;

  const evidence = [];
  const gates_cited = [];

  // H4 Bias bullish?
  if (chart?.h4_bias === 'bullish' || chart?.h4_hoh) {
    evidence.push('H4 HOH+HL chain intact → bullish structural bias confirmed');
    gates_cited.push('CORE_1_H4_BIAS');
  }

  // BOS in bullish direction
  if (chart?.h4_bos && chart?.bos_direction === 'bullish') {
    evidence.push('H4 BOS to the upside → trend confirmed bullish');
    gates_cited.push('BOS_BULLISH');
  }

  // POI / OB tapped in discount zone
  if (chart?.h4_ob_location && chart?.discount_zone) {
    evidence.push('H4 OB tapped in discount zone → institutional buy zone active (CORE 3)');
    gates_cited.push('CORE_3_OB_TAPPED');
  }

  // Inducement swept
  if (chart?.inducement_swept || chart?.bsl_ssl_swept) {
    evidence.push('SSL inducement swept → liquidity grab complete (CORE 4 NON-NEGOTIABLE)');
    gates_cited.push('CORE_4_INDUCEMENT_SWEPT');
  }

  // CHoCH on M15
  if (chart?.choch_triggered || chart?.cisd_candle) {
    evidence.push('M15 CHoCH/CISD confirmed → delivery started (CORE 5)');
    gates_cited.push('CORE_5_CHOCH_CISD');
  }

  // Kill zone alignment
  if (chart?.quarterly_phase === 'Q2' || chart?.quarterly_phase === 'Q3') {
    evidence.push(`In ${chart.quarterly_phase} phase → valid trading window for LONG`);
    gates_cited.push('QT_PHASE_VALID');
  }

  // FVG present above
  if (chart?.fvg_present && chart?.fvg_direction === 'bullish') {
    evidence.push('Bullish FVG present → draw on liquidity above, price likely to fill');
    gates_cited.push('FVG_BULLISH_ABOVE');
  }

  // SMT alignment
  if (chart?.smt_confirmed && chart?.smt_bullish) {
    evidence.push('SMT divergence bullish → correlated pair confirming long bias');
    gates_cited.push('SMT_DIVERGENCE_BULL');
  }

  // Multiframe alignment
  if (multiframe_data?.primary_bias === 'BULLISH' && multiframe_data?.alignment_score > 0.7) {
    evidence.push(`${Math.round(multiframe_data.alignment_score * 100)}% TF alignment bullish → strong consensus`);
    gates_cited.push('MULTIFRAME_ALIGNED_BULL');
  }

  // RSI in buy zone
  if (indicators?.RSI && indicators.RSI < 40) {
    evidence.push(`RSI at ${indicators.RSI} → oversold, momentum shift possible`);
  }

  const bull_score = Math.min(100, evidence.length * 12 + (gates_cited.length * 5));

  return {
    position: 'BULL',
    evidence,
    gates_cited,
    bull_score,
    recommendation: bull_score >= 60 ? 'LONG' : 'NEUTRAL',
    strongest_argument: evidence[0] || 'No bullish evidence found',
  };
}

// ─── BEAR ANALYST ────────────────────────────────────────────────────────────

function runBearAnalyst(params) {
  const { chart, indicators, quote, symbol, timeframe, rules, multiframe_data } = params;

  const objections = [];
  const risk_flags = [];

  // H4 Bias NOT bullish or actively bearish?
  if (chart?.h4_bias === 'bearish' || chart?.lh_ll_chain) {
    objections.push('H4 LH+LL chain intact → structural bias is BEARISH, long setups invalid');
    risk_flags.push('H4_BIAS_BEARISH');
  }

  // No inducement = no trade (CORE 4 NON-NEGOTIABLE)
  if (!chart?.inducement_swept && !chart?.bsl_ssl_swept) {
    objections.push('CORE 4 VIOLATED: No inducement sweep detected → setup NOT valid per vault rules');
    risk_flags.push('CORE_4_FAIL_CRITICAL');
  }

  // Wrong kill zone
  if (chart?.quarterly_phase === 'Q1' || chart?.quarterly_phase === 'Q4') {
    objections.push(`In ${chart.quarterly_phase} → accumulation/continuation phase, NOT distribution window`);
    risk_flags.push('WRONG_KILLZONE');
  }

  // POI already invalidated
  if (chart?.poi_invalidated) {
    objections.push('POI invalidated by H4 close through OB → zone dead, no entry');
    risk_flags.push('POI_INVALIDATED');
  }

  // RR insufficient
  if (quote?.last && chart?.tp_price && chart?.sl_price) {
    const rr = Math.abs(chart.tp_price - quote.last) / Math.abs(quote.last - chart.sl_price);
    if (rr < 2.0) {
      objections.push(`RR = ${rr.toFixed(2)}:1 — BELOW minimum 2:1 required by vault rules`);
      risk_flags.push('RR_INSUFFICIENT');
    }
  }

  // SMT against
  if (chart?.smt_confirmed && chart?.smt_bearish) {
    objections.push('SMT divergence BEARISH → correlated pair rejecting price, reversal risk HIGH');
    risk_flags.push('SMT_DIVERGENCE_BEAR');
  }

  // Consecutive losses kill switch
  if (rules?.consecutive_losses >= 3) {
    objections.push(`${rules.consecutive_losses} consecutive losses → KILL SWITCH ACTIVE (vault rule non-negotiable)`);
    risk_flags.push('KILL_SWITCH_ACTIVE');
  }

  // ATR too high (volatility filter)
  if (indicators?.ATR && quote?.last) {
    const atrPct = (indicators.ATR / quote.last) * 100;
    if (atrPct > 1.5) {
      objections.push(`ATR = ${atrPct.toFixed(2)}% of price → exceeds 1.5% volatility filter`);
      risk_flags.push('ATR_TOO_HIGH');
    }
  }

  // Multiframe divergence
  if (multiframe_data?.alignment_score < 0.6) {
    objections.push(`TF alignment only ${Math.round((multiframe_data?.alignment_score || 0) * 100)}% → divergence risk HIGH`);
    risk_flags.push('MULTIFRAME_DIVERGENCE');
  }

  // Premium zone for long attempt
  if (chart?.premium_zone && !chart?.discount_zone) {
    objections.push('Attempting LONG from premium zone → vault rule says only SELL from premium, BUY from discount');
    risk_flags.push('WRONG_ZONE_FOR_DIRECTION');
  }

  // DOL too close
  if (chart?.dol_too_close) {
    objections.push('Draw on Liquidity < 2R away → insufficient room to run, skip');
    risk_flags.push('DOL_TOO_CLOSE');
  }

  const has_critical_fail = risk_flags.some(f => ['CORE_4_FAIL_CRITICAL', 'KILL_SWITCH_ACTIVE', 'POI_INVALIDATED'].includes(f));
  const bear_score = Math.min(100, objections.length * 15);

  return {
    position: 'BEAR',
    objections,
    risk_flags,
    has_critical_fail,
    bear_score,
    recommendation: has_critical_fail ? 'SKIP_CRITICAL' : bear_score >= 45 ? 'SKIP' : 'NEUTRAL',
    strongest_objection: objections[0] || 'No significant risks identified',
  };
}

// ─── DEBATE ROUNDS ───────────────────────────────────────────────────────────

function runDebateRound(bull, bear, round) {
  const exchange = [];

  // Bull responds to bear's strongest objection
  if (bear.objections.length > 0) {
    const bearObj = bear.objections[round % bear.objections.length];
    let bullResponse;

    if (bearObj.includes('inducement')) {
      bullResponse = bull.evidence.some(e => e.includes('inducement'))
        ? `Bull rebuts: Inducement IS swept as per CORE 4 — ${bull.gates_cited.includes('CORE_4_INDUCEMENT_SWEPT') ? 'gate confirmed' : 'check lower TF'}`
        : 'Bull concedes: Inducement not confirmed — this is a valid CORE 4 block';
    } else if (bearObj.includes('kill zone') || bearObj.includes('Q1') || bearObj.includes('Q4')) {
      bullResponse = bull.gates_cited.includes('QT_PHASE_VALID')
        ? 'Bull rebuts: We ARE in Q2/Q3 valid window per vault kill zone rules'
        : 'Bull concedes: Kill zone timing is against us — valid objection';
    } else if (bearObj.includes('RR')) {
      bullResponse = 'Bull notes: RR must be recalculated to DOL — if DOL ≥ 2R the gate passes';
    } else {
      bullResponse = bull.evidence.length > round
        ? `Bull maintains: ${bull.evidence[round % bull.evidence.length]}`
        : 'Bull has no further evidence for this point';
    }

    exchange.push({ speaker: 'BULL', round, statement: bullResponse });
  }

  // Bear responds to bull's strongest evidence
  if (bull.evidence.length > 0) {
    const bullEvid = bull.evidence[round % bull.evidence.length];
    let bearResponse;

    if (bullEvid.includes('H4') && bull.gates_cited.includes('CORE_1_H4_BIAS')) {
      bearResponse = bear.risk_flags.includes('H4_BIAS_BEARISH')
        ? 'Bear maintains: H4 bias is BEARISH by structure — bull is cherry-picking indicators'
        : 'Bear acknowledges H4 bias — but higher TF must confirm before entry';
    } else if (bullEvid.includes('OB') || bullEvid.includes('FVG')) {
      bearResponse = bear.risk_flags.includes('POI_INVALIDATED')
        ? 'Bear: OB/FVG invalidated by prior close through — dead zone'
        : `Bear notes: OB/FVG valid but ${bear.objections[0] || 'timing concerns remain'}`;
    } else {
      bearResponse = bear.objections.length > round
        ? `Bear persists: ${bear.objections[round % bear.objections.length]}`
        : 'Bear has no further objections for this point';
    }

    exchange.push({ speaker: 'BEAR', round, statement: bearResponse });
  }

  return exchange;
}

// ─── VAULT ARBITER ───────────────────────────────────────────────────────────

function vaultArbiter(bull, bear, confluenceResult, killZoneResult, debate_log) {
  // Critical fails are absolute blocks — vault rules non-negotiable
  if (bear.has_critical_fail) {
    const critical = bear.risk_flags.filter(f => ['CORE_4_FAIL_CRITICAL', 'KILL_SWITCH_ACTIVE', 'POI_INVALIDATED'].includes(f));
    return {
      decision: 'SKIP',
      reason: `VAULT HARD BLOCK: ${critical.join(', ')} — non-negotiable rule violation`,
      confidence: 0.98,
      side: 'BEAR_WINS_CRITICAL',
      vault_gate_override: critical[0],
    };
  }

  // Kill zone block
  if (killZoneResult && !killZoneResult.kill_zone?.trading_allowed) {
    return {
      decision: 'WAIT',
      reason: `Kill zone inactive: ${killZoneResult.kill_zone?.reason} — next window: ${killZoneResult.kill_zone?.next_phase_change}`,
      confidence: 0.95,
      side: 'ARBITER_KILLZONE',
      vault_gate_override: 'ENTRY_TIME_KILLZONE',
    };
  }

  // Confluence score decides
  if (confluenceResult?.confluence_score >= 70 && confluenceResult?.tradeable) {
    const edge = bull.bull_score - bear.bear_score;
    if (edge >= 20) {
      return {
        decision: bull.recommendation === 'LONG' ? 'LONG' : 'NEUTRAL',
        reason: `Confluence ${confluenceResult.confluence_score}/100, ${bull.gates_cited.length} vault gates confirmed. Bull argument wins by ${edge} points.`,
        confidence: Math.min(0.95, 0.50 + (confluenceResult.confluence_score / 200)),
        side: 'BULL_WINS',
        gates_passed: confluenceResult.gates_passed,
        vault_gate_override: null,
      };
    }
  }

  // Close debate → lean on confluence
  if (confluenceResult?.confluence_score >= 50) {
    return {
      decision: 'WAIT',
      reason: `Confluence ${confluenceResult.confluence_score}/100 — below 70 threshold. Setup forming but not ready.`,
      confidence: 0.72,
      side: 'NEUTRAL',
      vault_gate_override: null,
    };
  }

  return {
    decision: 'SKIP',
    reason: `Bull score: ${bull.bull_score}, Bear score: ${bear.bear_score}. Confluence too low (${confluenceResult?.confluence_score || 0}/100).`,
    confidence: 0.80,
    side: 'BEAR_WINS_POINTS',
    vault_gate_override: null,
  };
}

// ─── DIRECTION MIRROR ────────────────────────────────────────────────────────
// The analyst/arbiter pipeline reasons in LONG terms. For SHORT setups we
// mirror the chart context so the same gates apply, then flip the decision.

function flipBias(b) {
  if (b === 'bullish') return 'bearish';
  if (b === 'bearish') return 'bullish';
  return b;
}

function mirrorChartForShort(chart) {
  return {
    ...chart,
    h4_bias: flipBias(chart.h4_bias),
    h4_hoh: chart.lh_ll_chain,
    lh_ll_chain: chart.h4_hoh,
    bos_direction: flipBias(chart.bos_direction),
    fvg_direction: flipBias(chart.fvg_direction),
    smt_bullish: chart.smt_bearish,
    smt_bearish: chart.smt_bullish,
    premium_zone: chart.discount_zone,
    discount_zone: chart.premium_zone,
  };
}

function mirrorMultiframeForShort(mf) {
  if (!mf) return mf;
  const flip = b => (b === 'BULLISH' ? 'BEARISH' : b === 'BEARISH' ? 'BULLISH' : b);
  return { ...mf, primary_bias: flip(mf.primary_bias) };
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export async function runVaultDebate(params) {
  const {
    symbol,
    timeframe,
    chart = {},
    indicators = {},
    quote = {},
    entryPrice,
    slPrice,
    tpPrice,
    multiframe_data,
    bars,
    rules: ruleParams = {},
    debate_rounds = 2,
    current_hour_utc,         // override for testing — defaults to real UTC hour
  } = params;

  if (!symbol) {
    return { success: false, error: 'symbol is required' };
  }

  // Direction handling: engine reasons in LONG terms; SHORT setups get mirrored.
  const direction = String(chart.direction || params.direction || 'LONG').toUpperCase();

  // CORE 4 input normalization — accept detector-style field names
  // (inducement_detect → inducement_detected, liquidity_mapper → bsl_swept/ssl_swept)
  const directionSweep = direction === 'SHORT' ? chart.bsl_swept : chart.ssl_swept;
  const inducementOk = !!(chart.inducement_swept || chart.bsl_ssl_swept || chart.inducement_detected || directionSweep);

  let workingChart = { ...chart, inducement_swept: inducementOk };
  let workingMf = multiframe_data;
  let workingInd = indicators;
  if (direction === 'SHORT') {
    workingChart = mirrorChartForShort(workingChart);
    workingMf = mirrorMultiframeForShort(multiframe_data);
    if (indicators?.RSI != null) workingInd = { ...indicators, RSI: 100 - indicators.RSI };
  }

  // Phase 1 — Run both analysts simultaneously
  const [bull, bear] = [
    runBullAnalyst({ chart: workingChart, indicators: workingInd, quote, symbol, timeframe, multiframe_data: workingMf }),
    runBearAnalyst({ chart: workingChart, indicators: workingInd, quote, symbol, timeframe, rules: ruleParams, multiframe_data: workingMf }),
  ];

  // Phase 2 — Confluence gate evaluation
  let confluenceResult = null;
  if (entryPrice && slPrice && tpPrice) {
    try {
      confluenceResult = await scoreConfluence({ entryPrice, slPrice, tpPrice, symbol, quote, indicators: workingInd, chart: workingChart, consecutiveLosses: ruleParams.consecutive_losses });
    } catch (_) { /* no rules.json fallback OK */ }
  }

  // Phase 3 — Kill zone check (use provided hour or real UTC hour)
  const hour = current_hour_utc ?? new Date().getUTCHours();
  let killZoneResult = null;
  try {
    killZoneResult = await checkSymbolRulesAndKillZone({ symbol, current_hour_utc: hour, rules: {} });
  } catch (_) {}

  // Phase 4 — Structured debate rounds
  const debate_log = [];
  for (let r = 0; r < debate_rounds; r++) {
    const round_exchanges = runDebateRound(bull, bear, r);
    debate_log.push({ round: r + 1, exchanges: round_exchanges });
  }

  // Phase 5 — Vault Arbiter final decision
  const arbiter = vaultArbiter(bull, bear, confluenceResult, killZoneResult, debate_log);

  // Un-mirror the decision label for SHORT setups
  const action = direction === 'SHORT' && arbiter.decision === 'LONG' ? 'SHORT' : arbiter.decision;

  return {
    success: true,
    symbol,
    direction,
    timeframe: timeframe || 'H4',
    vault_decision: {
      action,
      confidence: arbiter.confidence,
      reason: arbiter.reason,
      side_prevailed: arbiter.side,
      vault_gate_override: arbiter.vault_gate_override,
      gates_passed: arbiter.gates_passed || (confluenceResult?.gates_passed ?? 0),
    },
    bull_analyst: {
      evidence_count: bull.evidence.length,
      vault_gates_cited: bull.gates_cited,
      bull_score: bull.bull_score,
      recommendation: bull.recommendation,
      strongest_argument: bull.strongest_argument,
    },
    bear_analyst: {
      objections_count: bear.objections.length,
      risk_flags: bear.risk_flags,
      bear_score: bear.bear_score,
      has_critical_fail: bear.has_critical_fail,
      strongest_objection: bear.strongest_objection,
    },
    debate_log,
    confluence_score: confluenceResult?.confluence_score ?? null,
    kill_zone: killZoneResult?.kill_zone ?? null,
    trading_allowed: killZoneResult?.trading_allowed ?? true,
    session_timestamp: new Date().toISOString(),
  };
}
