import type { ProductTier, TierFeature } from '../types';
import { TIER_FEATURES } from '../types';
import { loadPreferences, savePreferences, OperatingMode } from '../utils/storage';

const TIER_ORDER: Record<ProductTier, number> = {
  personal: 0,
  professional: 1,
  enterprise: 2,
};

const ROUTE_FEATURE_MAP: Record<string, string> = {
  '/app/pipeline': 'pipeline',
  '/app/billing': 'billing',
  '/app/intake-inbox': 'intake',
  '/app/discovery': 'discovery',
  '/app/client-portal': 'crm',
  '/app/mail-room': 'mail-room',
  '/app/legal-team': 'legal-team',
  '/app/firm-command': 'firm-command',
  '/app/intercom': 'intercom',
  '/app/case-thread': 'case-threads',
  '/app/integrations': 'integrations',
  '/app/agent-status': 'agent-status',
  '/app/firm-admin': 'team-management',
};

export function getCurrentTier(): ProductTier {
  const prefs = loadPreferences() as any;
  if (prefs.productTier === 'personal' || prefs.productTier === 'professional' || prefs.productTier === 'enterprise') {
    return prefs.productTier as ProductTier;
  }
  return tierFromOperatingMode(prefs.operatingMode || 'partner');
}

export function setCurrentTier(tier: ProductTier): void {
  const operatingMode: OperatingMode = tier === 'personal' ? 'companion' : 'partner';
  (savePreferences as any)({ operatingMode, productTier: tier });
}

export function isFeatureAvailable(featureId: string): boolean {
  const currentTier = getCurrentTier();
  const feature = TIER_FEATURES.find(f => f.id === featureId);
  if (!feature) return true;
  return TIER_ORDER[currentTier] >= TIER_ORDER[feature.requiredTier];
}

export function getTierLabel(tier: ProductTier): string {
  const labels: Record<ProductTier, string> = {
    personal: 'CaseBuddy Personal',
    professional: 'CaseBuddy Professional',
    enterprise: 'CaseBuddy Enterprise',
  };
  return labels[tier];
}

export function getTierFeatures(tier: ProductTier): TierFeature[] {
  const maxOrder = TIER_ORDER[tier];
  return TIER_FEATURES.filter(f => TIER_ORDER[f.requiredTier] <= maxOrder);
}

export function getUpgradeFeatures(currentTier: ProductTier): TierFeature[] {
  const currentOrder = TIER_ORDER[currentTier];
  return TIER_FEATURES.filter(f => TIER_ORDER[f.requiredTier] > currentOrder);
}

export function getFeatureByRoute(route: string): TierFeature | null {
  const featureId = ROUTE_FEATURE_MAP[route];
  if (!featureId) return null;
  const feature = TIER_FEATURES.find(f => f.id === featureId);
  if (!feature || feature.requiredTier === 'personal') return null;
  return feature;
}

export function tierFromOperatingMode(mode: OperatingMode): ProductTier {
  return mode === 'companion' ? 'personal' : 'professional';
}
