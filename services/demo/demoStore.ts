// Mutable in-memory clone of the demo seed. Hydrates from sessionStorage on first
// access (so reloads survive). Mutations are persisted on every write.

import type {
  Asset, AssetRelationship, PolicyV2, Vulnerability, Capability, ControlRegistry,
  InternalControl, Compliance, Contact, OrgContact, ProgramTask, AllActivityLog,
  PolicyApproval, PolicyNotification, ControlNotification, OrgNotification,
} from '../../types';
import {
  SEED_ASSETS, SEED_ASSET_RELATIONSHIPS, SEED_POLICIES, SEED_VULNERABILITIES,
  SEED_CAPABILITIES, SEED_CONTROL_REGISTRY, SEED_INTERNAL_CONTROLS, SEED_COMPLIANCE,
  SEED_CONTACTS, SEED_ORG_CONTACTS, SEED_PROGRAM_TASKS, SEED_ACTIVITY_LOGS,
  SEED_SCORING_HISTORY, SEED_POLICY_APPROVALS, SEED_POLICY_NOTIFICATIONS,
  SEED_CONTROL_NOTIFICATIONS, SEED_ORG_NOTIFICATIONS, SEED_ASSET_TYPES,
  SEED_ASSET_CUSTOM_FIELDS, SEED_ORG_SETTINGS, SEED_POLICY_HISTORY,
} from './demoSeed';
import { readPersistedStore, writePersistedStore } from './demoMode';

// Bump this whenever the seed shape changes in a way that would corrupt persisted
// stores from earlier demo sessions. Mismatched version triggers a fresh re-hydration.
const SEED_VERSION = 3;

interface PersistedShape {
  _version: number;
  data: DemoStore;
}

export interface DemoStore {
  assets: Asset[];
  assetRelationships: AssetRelationship[];
  policies: PolicyV2[];
  vulnerabilities: Vulnerability[];
  capabilities: Capability[];
  controlRegistry: ControlRegistry[];
  internalControls: InternalControl[];
  compliance: Compliance[];
  contacts: Contact[];
  orgContacts: OrgContact[];
  programTasks: ProgramTask[];
  activityLogs: AllActivityLog[];
  scoringHistory: any[];
  policyApprovals: PolicyApproval[];
  policyHistory: AllActivityLog[];
  policyNotifications: PolicyNotification[];
  controlNotifications: ControlNotification[];
  orgNotifications: OrgNotification[];
  assetTypes: { id: string; name: string; fields: string[] }[];
  assetCustomFields: any[];
  orgSettings: { policy_refresh_months: number; needed_framework: string[] };
}

const freshFromSeed = (): DemoStore => ({
  // Deep clone via JSON round-trip so the seed is never mutated
  assets: JSON.parse(JSON.stringify(SEED_ASSETS)),
  assetRelationships: JSON.parse(JSON.stringify(SEED_ASSET_RELATIONSHIPS)),
  policies: JSON.parse(JSON.stringify(SEED_POLICIES)),
  vulnerabilities: JSON.parse(JSON.stringify(SEED_VULNERABILITIES)),
  capabilities: JSON.parse(JSON.stringify(SEED_CAPABILITIES)),
  controlRegistry: JSON.parse(JSON.stringify(SEED_CONTROL_REGISTRY)),
  internalControls: JSON.parse(JSON.stringify(SEED_INTERNAL_CONTROLS)),
  compliance: JSON.parse(JSON.stringify(SEED_COMPLIANCE)),
  contacts: JSON.parse(JSON.stringify(SEED_CONTACTS)),
  orgContacts: JSON.parse(JSON.stringify(SEED_ORG_CONTACTS)),
  programTasks: JSON.parse(JSON.stringify(SEED_PROGRAM_TASKS)),
  activityLogs: JSON.parse(JSON.stringify(SEED_ACTIVITY_LOGS)),
  scoringHistory: JSON.parse(JSON.stringify(SEED_SCORING_HISTORY)),
  policyApprovals: JSON.parse(JSON.stringify(SEED_POLICY_APPROVALS)),
  policyHistory: JSON.parse(JSON.stringify(SEED_POLICY_HISTORY)),
  policyNotifications: JSON.parse(JSON.stringify(SEED_POLICY_NOTIFICATIONS)),
  controlNotifications: JSON.parse(JSON.stringify(SEED_CONTROL_NOTIFICATIONS)),
  orgNotifications: JSON.parse(JSON.stringify(SEED_ORG_NOTIFICATIONS)),
  assetTypes: JSON.parse(JSON.stringify(SEED_ASSET_TYPES)),
  assetCustomFields: JSON.parse(JSON.stringify(SEED_ASSET_CUSTOM_FIELDS)),
  orgSettings: JSON.parse(JSON.stringify(SEED_ORG_SETTINGS)),
});

let _store: DemoStore | null = null;

export const getStore = (): DemoStore => {
  if (_store) return _store;
  const persisted = readPersistedStore();
  if (persisted) {
    try {
      const parsed = JSON.parse(persisted) as Partial<PersistedShape>;
      if (parsed && parsed._version === SEED_VERSION && parsed.data) {
        _store = parsed.data;
        return _store!;
      }
      // Stale persisted store from an older seed shape — drop and re-hydrate
    } catch {
      // fall through and rehydrate from seed
    }
  }
  _store = freshFromSeed();
  persist();
  return _store;
};

export const persist = (): void => {
  if (!_store) return;
  try {
    const wrapped: PersistedShape = { _version: SEED_VERSION, data: _store };
    writePersistedStore(JSON.stringify(wrapped));
  } catch {
    /* size limit hit — fall back to in-memory only */
  }
};

// Quick uuid for newly-created records inside demo mode
let _newIdCounter = 0;
export const newId = (prefix = 'demo-new'): string => {
  _newIdCounter += 1;
  return `${prefix}-${Date.now()}-${_newIdCounter}`;
};
