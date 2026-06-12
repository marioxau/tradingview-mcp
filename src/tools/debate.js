import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/debate.js';

const chartSchema = z.object({
  direction: z.enum(['LONG', 'SHORT', 'long', 'short']).optional()
    .describe('Setup direction. SHORT setups are mirrored internally so all gates apply symmetrically.'),
  h4_bias: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  h1_bias: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  m15_bias: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  m5_bias: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  h4_hoh: z.boolean().optional(),
  lh_ll_chain: z.boolean().optional(),
  h4_bos: z.boolean().optional(),
  bos_direction: z.string().optional(),
  h4_ob_location: z.number().optional(),
  discount_zone: z.boolean().optional(),
  premium_zone: z.boolean().optional(),
  inducement_swept: z.boolean().optional(),
  bsl_ssl_swept: z.boolean().optional(),
  inducement_detected: z.boolean().optional().describe('Alias from inducement_detect tool output'),
  bsl_swept: z.boolean().optional().describe('BSL pool swept — CORE 4 inducement for SHORT setups'),
  ssl_swept: z.boolean().optional().describe('SSL pool swept — CORE 4 inducement for LONG setups'),
  inducement_strength: z.string().optional(),
  poi: z.number().optional(),
  bsl: z.number().optional(),
  ssl: z.number().optional(),
  current_price: z.number().optional(),
  regime: z.string().optional(),
  regime_confidence: z.number().optional(),
  multiframe_score: z.number().optional(),
  choch_triggered: z.boolean().optional(),
  cisd_candle: z.boolean().optional(),
  quarterly_phase: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
  fvg_present: z.boolean().optional(),
  fvg_direction: z.enum(['bullish', 'bearish']).optional(),
  smt_confirmed: z.boolean().optional(),
  smt_bullish: z.boolean().optional(),
  smt_bearish: z.boolean().optional(),
  poi_invalidated: z.boolean().optional(),
  tp_price: z.number().optional(),
  sl_price: z.number().optional(),
  dol_too_close: z.boolean().optional(),
  wick_beyond_swing: z.boolean().optional(),
}).optional();

export function registerDebateTools(server) {
  server.tool(
    'vault_debate',
    'Run a vault-powered Bull/Bear debate on a chart setup. Both analysts use ICT/SMC vault knowledge (37 strategies, 18 gates, kill zones). Returns a structured VaultDecision with full debate log.',
    {
      symbol: z.string().describe('Symbol being analyzed (e.g., XAUUSD, Deriv:VOLATILITY_75_INDEX)'),
      timeframe: z.string().optional().describe('Analysis timeframe (e.g., H4, H1, M15)'),
      chart: chartSchema.describe('Chart structure data — all ICT/SMC signals observed on the chart'),
      indicators: z.object({
        ATR: z.number().optional(),
        RSI: z.number().optional(),
        MACD: z.number().optional(),
        momentum: z.number().optional(),
      }).optional().describe('Current indicator readings'),
      quote: z.object({
        last: z.number().optional(),
        close: z.number().optional(),
        volume: z.number().optional(),
      }).optional().describe('Current price quote'),
      entryPrice: z.number().optional().describe('Proposed entry price — required for full RR gate evaluation'),
      slPrice: z.number().optional().describe('Proposed stop loss price'),
      tpPrice: z.number().optional().describe('Proposed take profit / target price'),
      multiframe_data: z.object({
        primary_bias: z.string().optional(),
        alignment_score: z.number().optional(),
      }).optional().describe('Output from multiframe_analyze — enriches debate context'),
      rules: z.object({
        consecutive_losses: z.number().optional(),
      }).optional().describe('Risk state — consecutive losses count for kill switch gate'),
      debate_rounds: z.number().min(1).max(5).optional().default(2).describe('Number of debate rounds between bull and bear (1-5). Default 2.'),
      current_hour_utc: z.number().min(0).max(23).optional().describe('Override UTC hour for kill zone check. Auto-detected if omitted.'),
    },
    async ({ symbol, timeframe, chart, indicators, quote, entryPrice, slPrice, tpPrice, multiframe_data, rules, debate_rounds, current_hour_utc }) => {
      try {
        const result = await core.runVaultDebate({
          symbol, timeframe, chart, indicators, quote,
          entryPrice, slPrice, tpPrice,
          multiframe_data, rules, debate_rounds, current_hour_utc,
        });
        return jsonResult(result);
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    }
  );
}
