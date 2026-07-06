import { deepseekChat, parseDeepSeekJson } from './deepseek';

// ──────────────────────────────────────
// CALCULATOR 1: Personal Injury Damages
// ──────────────────────────────────────

export interface PIDamagesInput {
  state: string;
  medicalBills: number;
  futureMedicalEstimate: number;
  lostWages: number;
  futureLostWages: number;
  propertyDamage: number;
  painAndSufferingMultiplier: number; // 1.5-5.0
  permanentImpairment: boolean;
  impairmentPercentage: number;       // 0-100
  liabilityFactor: number;            // 0-100, plaintiff's share of fault
  comparativeNegligenceState: boolean;
  insurancePolicyLimits: number;
  settlementDemand?: number;
}

export interface PIDamagesResult {
  economicDamages: {
    medicalBills: number;
    futureMedical: number;
    lostWages: number;
    futureLostWages: number;
    propertyDamage: number;
    totalEconomic: number;
  };
  nonEconomicDamages: {
    painAndSuffering: number;
    permanentImpairment: number;
    lossOfEnjoyment: number;
    totalNonEconomic: number;
  };
  grossDamages: number;
  liabilityReduction: number;
  netDamages: number;
  insuranceCoverage: number;
  realisticRecovery: number;
  settlementRange: { low: number; mid: number; high: number };
  analysis: string;
}

const IMPAIRMENT_RATE_PER_PCT = 10000; // $10,000 per 1% impairment
const LOSS_OF_ENJOYMENT_FLAT = 15000;
const SETTLEMENT_DISCOUNT = 0.85;
const ROUND = (n: number) => Math.round(n * 100) / 100;

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

export async function calculatePIDamages(input: PIDamagesInput): Promise<PIDamagesResult> {
  const m = input.medicalBills || 0;
  const fm = input.futureMedicalEstimate || 0;
  const lw = input.lostWages || 0;
  const fl = input.futureLostWages || 0;
  const pd = input.propertyDamage || 0;
  const totalEconomic = ROUND(m + fm + lw + fl + pd);

  const multiplier = clamp(input.painAndSufferingMultiplier || 1.5, 1.5, 5.0);
  const painAndSuffering = ROUND(totalEconomic * multiplier);

  const impPct = clamp(input.impairmentPercentage || 0, 0, 100);
  const permanentImpairment = input.permanentImpairment
    ? ROUND(impPct * IMPAIRMENT_RATE_PER_PCT)
    : 0;
  const lossOfEnjoyment = ROUND(LOSS_OF_ENJOYMENT_FLAT);

  const totalNonEconomic = ROUND(painAndSuffering + permanentImpairment + lossOfEnjoyment);
  const grossDamages = ROUND(totalEconomic + totalNonEconomic);

  const liabilityFactor = clamp(input.liabilityFactor || 0, 0, 100);
  const liabilityReduction = input.comparativeNegligenceState
    ? ROUND(grossDamages * (liabilityFactor / 100))
    : 0;
  const netDamages = ROUND(grossDamages - liabilityReduction);

  const insuranceCoverage = input.insurancePolicyLimits || 0;
  const realisticRecovery = ROUND(Math.min(netDamages, insuranceCoverage) * SETTLEMENT_DISCOUNT);

  const settlementRange = {
    low: ROUND(realisticRecovery * 0.7),
    mid: realisticRecovery,
    high: ROUND(realisticRecovery * 1.3),
  };

  const result: Omit<PIDamagesResult, 'analysis'> = {
    economicDamages: {
      medicalBills: m,
      futureMedical: fm,
      lostWages: lw,
      futureLostWages: fl,
      propertyDamage: pd,
      totalEconomic,
    },
    nonEconomicDamages: {
      painAndSuffering,
      permanentImpairment,
      lossOfEnjoyment,
      totalNonEconomic,
    },
    grossDamages,
    liabilityReduction,
    netDamages,
    insuranceCoverage,
    realisticRecovery,
    settlementRange,
  };

  const analysis = await generateAnalysis(
    'personal injury damages',
    `State: ${input.state || 'Unknown'}. ` +
    `Gross damages: $${grossDamages}. ` +
    `Economic: $${totalEconomic}, Non-economic: $${totalNonEconomic}. ` +
    `Liability reduction: $${liabilityReduction} (${liabilityFactor}% fault). ` +
    `Realistic recovery: $${realisticRecovery}. ` +
    (input.settlementDemand ? `Settlement demand: $${input.settlementDemand}. ` : ''),
    `You are a senior personal injury attorney. Analyze this damages calculation in 2-3 sentences. ` +
    `Comment on whether the realistic recovery is fair, how the liability factor affects the outcome, ` +
    `and whether the settlement demand (if provided) is reasonable. Plain English only.`
  );

  return { ...result, analysis };
}

// ──────────────────────────────────────
// CALCULATOR 2: Criminal Sentencing Estimator
// ──────────────────────────────────────

export interface SentencingInput {
  state: string;
  offense: string;
  offenseClass: string;
  priorFelonies: number;
  priorMisdemeanors: number;
  weaponEnhancement: boolean;
  injuryEnhancement: boolean;
  drugQuantityEnhancement: boolean;
  acceptanceOfResponsibility: boolean;
  pleaAgreement: boolean;
  cooperationWithGovernment: boolean;
  guidelinesRange?: string;
}

export interface SentencingResult {
  statutoryMinimum: number;
  statutoryMaximum: number;
  guidelinesRange: { low: number; high: number };
  enhancements: { label: string; months: number }[];
  reductions: { label: string; months: number }[];
  estimatedSentence: { low: number; mid: number; high: number };
  probationEligibility: boolean;
  alternativePrograms: string[];
  analysis: string;
}

interface ClassRange { low: number; high: number; }

const OFFENSE_CLASS_RANGES: Record<string, ClassRange> = {
  'Class A Felony': { low: 120, high: 9999 },  // 10-life, capped at 9999
  'Class B Felony': { low: 60, high: 360 },
  'Class C Felony': { low: 36, high: 240 },
  'Class D Felony': { low: 12, high: 144 },
  'Misdemeanor A': { low: 0, high: 12 },
  'Misdemeanor B': { low: 0, high: 6 },
};

const LIFE_MONTHS = 9999;

function parseGuidelinesRange(input: string | undefined): ClassRange | null {
  if (!input) return null;
  const cleaned = input.replace(/[,]/g, '');
  const nums = cleaned.match(/\d+(\.\d+)?/g);
  if (!nums || nums.length < 1) return null;
  const low = Number(nums[0]);
  const high = nums.length >= 2 ? Number(nums[1]) : low * 1.25;
  return { low: Math.round(low), high: Math.round(high) };
}

function monthsToYears(n: number): number {
  return Math.round(n); // keep as months, caller formats if needed
}

export async function estimateSentence(input: SentencingInput): Promise<SentencingResult> {
  const classRange = OFFENSE_CLASS_RANGES[input.offenseClass] || { low: 0, high: 60 };
  const statutoryMinimum = classRange.low;
  const statutoryMaximum = classRange.high;

  const parsed = parseGuidelinesRange(input.guidelinesRange);
  const baseLow = parsed ? parsed.low : statutoryMinimum;
  const baseHigh = parsed ? parsed.high : Math.min(
    statutoryMaximum,
    statutoryMinimum + Math.floor((statutoryMaximum - statutoryMinimum) * 0.6)
  );

  const priorFelonyMonths = (input.priorFelonies || 0) * 12;
  const priorMisdMonths = (input.priorMisdemeanors || 0) * 3;

  const enhancements: { label: string; months: number }[] = [];
  let enhancementTotal = 0;

  if (input.weaponEnhancement) {
    const months = 42; // midpoint of 24-60
    enhancements.push({ label: 'Weapon Enhancement (+24-60 mo)', months });
    enhancementTotal += months;
  }
  if (input.injuryEnhancement) {
    const months = 30; // midpoint of 12-48
    enhancements.push({ label: 'Injury Enhancement (+12-48 mo)', months });
    enhancementTotal += months;
  }
  if (input.drugQuantityEnhancement) {
    const months = 78; // midpoint of 36-120
    enhancements.push({ label: 'Drug Quantity Enhancement (+36-120 mo)', months });
    enhancementTotal += months;
  }

  if (priorFelonyMonths > 0) {
    enhancements.push({ label: `Prior Felonies (${input.priorFelonies} × 12 mo)`, months: priorFelonyMonths });
    enhancementTotal += priorFelonyMonths;
  }
  if (priorMisdMonths > 0) {
    enhancements.push({ label: `Prior Misdemeanors (${input.priorMisdemeanors} × 3 mo)`, months: priorMisdMonths });
    enhancementTotal += priorMisdMonths;
  }

  const enhancedLow = ROUND(baseLow + enhancementTotal);
  const enhancedHigh = ROUND(baseHigh + enhancementTotal);

  let reductionPct = 0;
  const reductions: { label: string; months: number }[] = [];

  if (input.acceptanceOfResponsibility) reductionPct += 0.25;
  if (input.pleaAgreement) reductionPct += 0.15;
  if (input.cooperationWithGovernment) reductionPct += 0.30;

  const reductionMonths = ROUND(enhancedLow * reductionPct);
  if (input.acceptanceOfResponsibility) {
    reductions.push({ label: 'Acceptance of Responsibility (-25%)', months: ROUND(enhancedLow * 0.25) });
  }
  if (input.pleaAgreement) {
    reductions.push({ label: 'Plea Agreement (-15%)', months: ROUND(enhancedLow * 0.15) });
  }
  if (input.cooperationWithGovernment) {
    reductions.push({ label: 'Cooperation (-30%)', months: ROUND(enhancedLow * 0.30) });
  }

  const reducedLow = ROUND(enhancedLow - reductionMonths);
  const reducedHigh = ROUND(enhancedHigh - reductionMonths);

  const guidelinesRange = {
    low: Math.round(baseLow),
    high: Math.round(baseHigh),
  };

  const estimatedMid = ROUND((reducedLow + reducedHigh) / 2);
  const estimatedSentence = {
    low: reducedLow > 0 ? reducedLow : 0,
    mid: estimatedMid > 0 ? estimatedMid : 0,
    high: reducedHigh > 0 ? reducedHigh : ROUND(reducedLow * 1.25),
  };

  const probationEligibility = estimatedSentence.low <= 12 && !input.weaponEnhancement;

  const alternativePrograms: string[] = [];
  if (input.drugQuantityEnhancement) alternativePrograms.push('Drug Court / Treatment Diversion');
  if (input.injuryEnhancement || input.weaponEnhancement) alternativePrograms.push('Restorative Justice Program');
  if (estimatedSentence.low <= 24 && input.priorFelonies <= 1) alternativePrograms.push('Community Corrections / House Arrest');
  if (!input.weaponEnhancement && !input.injuryEnhancement) alternativePrograms.push('Deferred Adjudication / Probation');
  alternativePrograms.push('Presentence Investigation (PSI) Review');

  const result: Omit<SentencingResult, 'analysis'> = {
    statutoryMinimum,
    statutoryMaximum,
    guidelinesRange,
    enhancements,
    reductions,
    estimatedSentence,
    probationEligibility,
    alternativePrograms,
  };

  const offenseDesc = input.offense || 'Unknown offense';
  const analysis = await generateAnalysis(
    'criminal sentencing',
    `State: ${input.state || 'Unknown'}. ` +
    `Offense: ${offenseDesc} (${input.offenseClass || 'unspecified class'}). ` +
    `Guidelines: ${guidelinesRange.low}-${guidelinesRange.high} months. ` +
    `Enhancements total: +${enhancementTotal} months. ` +
    `Reductions: -${Math.round(reductionPct * 100)}%. ` +
    `Estimated sentence: ${estimatedSentence.low}-${estimatedSentence.high} months (mid: ${estimatedSentence.mid}). ` +
    `Prior record: ${input.priorFelonies || 0} felonies, ${input.priorMisdemeanors || 0} misdemeanors. ` +
    `Probation eligible: ${probationEligibility ? 'Yes' : 'No'}.`,
    `You are a senior criminal defense attorney. Analyze this sentencing estimate in 2-3 sentences. ` +
    `Discuss whether the estimated range seems reasonable, key factors driving the sentence, ` +
    `and what strategy might produce the best outcome. Plain English only.`
  );

  return { ...result, analysis };
}

// ──────────────────────────────────────
// CALCULATOR 3: Family Law Asset Divider
// ──────────────────────────────────────

export interface AssetItem {
  id: string;
  name: string;
  value: number;
  category: 'real-estate' | 'retirement' | 'investment' | 'business' | 'vehicle' | 'personal-property' | 'bank-account' | 'debt';
  isMarital: boolean;
  acquiredDuring: 'pre-marriage' | 'during-marriage' | 'post-separation';
  titledTo: 'husband' | 'wife' | 'joint' | 'other';
  notes?: string;
}

export interface AssetDivisionInput {
  state: string;
  marriageDurationYears: number;
  husbandIncome: number;
  wifeIncome: number;
  minorChildren: number;
  assets: AssetItem[];
  spouseSupportRequested: boolean;
  faultGrounds: boolean;
}

export interface AssetDivisionResult {
  totalMaritalEstate: number;
  husbandMaritalShare: number;
  wifeMaritalShare: number;
  husbandSeparateProperty: number;
  wifeSeparateProperty: number;
  distributionRatio: string;
  assetAllocation: {
    toHusband: { name: string; value: number; category: string }[];
    toWife: { name: string; value: number; category: string }[];
  };
  equalizationPayment: number;
  spouseSupport: {
    recommended: boolean;
    monthlyAmount: number;
    durationMonths: number;
    basis: string;
  };
  analysis: string;
}

const COMMUNITY_PROPERTY_STATES = new Set([
  'CA', 'TX', 'AZ', 'NM', 'NV', 'LA', 'WA', 'ID', 'WI',
  'California', 'Texas', 'Arizona', 'New Mexico', 'Nevada', 'Louisiana', 'Washington', 'Idaho', 'Wisconsin',
]);

function isCommunityProperty(state: string): boolean {
  return COMMUNITY_PROPERTY_STATES.has(state.trim());
}

export async function divideAssets(input: AssetDivisionInput): Promise<AssetDivisionResult> {
  const assets = input.assets || [];
  const state = input.state || '';
  const duration = input.marriageDurationYears || 0;
  const hIncome = input.husbandIncome || 0;
  const wIncome = input.wifeIncome || 0;
  const children = input.minorChildren || 0;

  // Separate marital vs separate property
  const maritalAssets = assets.filter(a => a.isMarital);
  const separateHusband = assets.filter(a => !a.isMarital && a.titledTo === 'husband');
  const separateWife = assets.filter(a => !a.isMarital && a.titledTo === 'wife');

  const totalMarital = ROUND(maritalAssets.reduce((sum, a) => sum + a.value, 0));
  const hSeparate = ROUND(separateHusband.reduce((sum, a) => sum + a.value, 0));
  const wSeparate = ROUND(separateWife.reduce((sum, a) => sum + a.value, 0));

  let husbandPct: number;
  let wifePct: number;

  if (isCommunityProperty(state)) {
    husbandPct = 0.50;
    wifePct = 0.50;
  } else {
    // Equitable distribution: default 50/50 then adjust
    husbandPct = 0.50;
    wifePct = 0.50;

    // Income disparity adjustment
    const totalIncome = hIncome + wIncome;
    if (totalIncome > 0) {
      const incomeRatio = hIncome / totalIncome;
      // Higher earner gets slightly less asset allocation
      if (hIncome > wIncome) {
        const shift = Math.min((incomeRatio - 0.5) * 0.2, 0.10);
        husbandPct -= shift;
        wifePct += shift;
      } else if (wIncome > hIncome) {
        const shift = Math.min((0.5 - incomeRatio) * 0.2, 0.10);
        husbandPct += shift;
        wifePct -= shift;
      }
    }

    // Marriage duration adjustment
    if (duration < 5) {
      husbandPct = hIncome > wIncome ? 0.55 : 0.45;
      wifePct = 1 - husbandPct;
    } else if (duration > 15) {
      // Favor lower earner
      if (hIncome < wIncome) {
        husbandPct = 0.55;
        wifePct = 0.45;
      } else {
        husbandPct = 0.45;
        wifePct = 0.55;
      }
    }

    // Children adjustment: 2% per child toward primary caregiver (assume wife)
    if (children > 0) {
      const shift = Math.min(children * 0.02, 0.10);
      wifePct += shift;
      husbandPct -= shift;
    }

    // Normalize
    const total = husbandPct + wifePct;
    husbandPct = ROUND(husbandPct / total);
    wifePct = ROUND(wifePct / total);
  }

  const hMaritalShare = ROUND(totalMarital * husbandPct);
  const wMaritalShare = ROUND(totalMarital * wifePct);

  // Asset allocation: allocate specific items
  const allocationH: { name: string; value: number; category: string }[] = [];
  const allocationW: { name: string; value: number; category: string }[] = [];

  let allocatedH = 0;
  let allocatedW = 0;

  // Pre-assign titled-to assets within marital pool
  const remaining: AssetItem[] = [];
  for (const asset of maritalAssets) {
    if (asset.titledTo === 'husband' && allocatedH + asset.value <= hMaritalShare + 0.01) {
      allocationH.push({ name: asset.name, value: asset.value, category: asset.category });
      allocatedH += asset.value;
    } else if (asset.titledTo === 'wife' && allocatedW + asset.value <= wMaritalShare + 0.01) {
      allocationW.push({ name: asset.name, value: asset.value, category: asset.category });
      allocatedW += asset.value;
    } else {
      remaining.push(asset);
    }
  }

  // Allocate remaining to whichever side needs it
  for (const asset of remaining) {
    if (allocatedH < hMaritalShare) {
      allocationH.push({ name: asset.name, value: asset.value, category: asset.category });
      allocatedH += asset.value;
    } else {
      allocationW.push({ name: asset.name, value: asset.value, category: asset.category });
      allocatedW += asset.value;
    }
  }

  // Add separate property to respective allocations
  for (const asset of separateHusband) {
    allocationH.push({ name: asset.name, value: asset.value, category: asset.category });
  }
  for (const asset of separateWife) {
    allocationW.push({ name: asset.name, value: asset.value, category: asset.category });
  }

  // Equalization payment (the gap between allocated marital and target share)
  const gap = ROUND(hMaritalShare - allocatedH);
  const equalizationPayment = gap > 0 ? gap : 0;

  // Spousal support calculation
  const incomeDiff = Math.abs(hIncome - wIncome);
  const monthlyAmount = ROUND(incomeDiff * 0.3 * (Math.max(duration, 1) / 2) / 12);
  const durationMonths = Math.round(Math.max(duration, 0) * 6); // 0.5 years per year → months
  const lowerEarner = hIncome < wIncome ? 'husband' : 'wife';

  const spouseSupport = {
    recommended: input.spouseSupportRequested && incomeDiff > 10000,
    monthlyAmount: monthlyAmount > 0 ? monthlyAmount : 0,
    durationMonths,
    basis: `${lowerEarner} earns less. ${Math.round(duration * 6)} months based on ${duration} year marriage.`,
  };

  const result: Omit<AssetDivisionResult, 'analysis'> = {
    totalMaritalEstate: totalMarital,
    husbandMaritalShare: hMaritalShare,
    wifeMaritalShare: wMaritalShare,
    husbandSeparateProperty: hSeparate,
    wifeSeparateProperty: wSeparate,
    distributionRatio: `${Math.round(husbandPct * 100)}/${Math.round(wifePct * 100)}`,
    assetAllocation: {
      toHusband: allocationH,
      toWife: allocationW,
    },
    equalizationPayment,
    spouseSupport,
  };

  const analysis = await generateAnalysis(
    'family law asset division',
    `State: ${state || 'Unknown'} (${isCommunityProperty(state) ? 'community property' : 'equitable distribution'}). ` +
    `Marriage duration: ${duration} years. ` +
    `Marital estate: $${totalMarital}. ` +
    `Distribution: ${Math.round(husbandPct * 100)}% husband / ${Math.round(wifePct * 100)}% wife. ` +
    `Husband income: $${hIncome}/yr, Wife income: $${wIncome}/yr. ` +
    `Minor children: ${children}. ` +
    `Equalization payment: $${equalizationPayment}. ` +
    `Spousal support: ${spouseSupport.recommended ? `$${monthlyAmount}/mo for ${durationMonths} mo` : 'Not recommended'}.`,
    `You are a senior family law attorney. Analyze this asset division in 2-3 sentences. ` +
    `Comment on the fairness of the split, whether spousal support is appropriate, ` +
    `and any strategic considerations for negotiation. Plain English only.`
  );

  return { ...result, analysis };
}

// ──────────────────────────────────────
// Shared AI analysis helper
// ──────────────────────────────────────

const FALLBACK_ANALYSES: Record<string, string> = {
  'personal injury damages':
    'This damages estimate reflects the economic and non-economic losses in this case. ' +
    'Liability reduction and policy limits significantly impact the realistic recovery amount. ' +
    'A negotiated settlement within the projected range is generally advisable to avoid trial risk.',
  'criminal sentencing':
    'The estimated sentence range is based on the offense class, applicable enhancements, and mitigating reductions. ' +
    'Acceptance of responsibility and cooperation can substantially reduce exposure. ' +
    'Consulting with counsel about plea options is strongly recommended.',
  'family law asset division':
    'The division reflects the marital estate allocation under applicable state law. ' +
    'Equalization payments and spousal support can help achieve a fair outcome. ' +
    'Mediation is recommended to minimize litigation costs and preserve cooperative co-parenting.',
};

async function generateAnalysis(
  category: string,
  facts: string,
  instruction: string,
): Promise<string> {
  try {
    const raw = await deepseekChat({
      temperature: 0.4,
      maxTokens: 256,
      jsonMode: false,
      messages: [
        { role: 'user', content: `${instruction}\n\nFacts: ${facts}\n\nProvide a concise 2-3 sentence analysis.` },
      ],
    });

    const trimmed = raw?.trim();
    if (trimmed && trimmed.length > 10) return trimmed;
    return FALLBACK_ANALYSES[category] || 'Analysis unavailable.';
  } catch {
    return FALLBACK_ANALYSES[category] || 'Analysis unavailable.';
  }
}
