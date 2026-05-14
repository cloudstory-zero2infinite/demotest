// Frozen seed data for ABC News demo mode.
// Every record here is fictional. Shapes mirror the real backend so the UI doesn't notice.

import type {
  Asset, AssetRelationship, PolicyV2, Vulnerability, Capability, ControlRegistry,
  InternalControl, Compliance, Contact, OrgContact, ProgramTask, AllActivityLog,
  PolicyApproval, PolicyNotification, ControlNotification, OrgNotification,
} from '../../types';

const DEMO_ORG_ID = 'demo-abc-news-org';
const DEMO_USER_ID = 'demo-abc-news-user';
const NOW = '2026-05-14T10:00:00.000Z';
const ts = (offsetDays = 0): string => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
};

// ─── Reference axes for variety ───────────────────────────────────────────────
const SITES = ['New York', 'London', 'Sydney', 'Bangalore', 'Singapore'] as const;
const BUS = ['Editorial', 'Broadcast', 'Digital', 'Marketing', 'IT', 'Finance', 'HR', 'Legal'] as const;
const OWNERS = [
  'Sarah Chen', 'James Mitchell', 'Priya Sharma', 'Marcus Johnson', 'Elena Rodriguez',
  'Akira Tanaka', 'David Goldberg', 'Aisha Patel', 'Liam O\'Brien', 'Sophia Müller',
];

// ─── Asset generator helpers ──────────────────────────────────────────────────
type PartialAsset = Partial<Asset> & Pick<Asset, 'asset_id' | 'name' | 'category' | 'criticality' | 'exposure'>;
let _assetIdx = 0;
const mkAsset = (p: PartialAsset): Asset => {
  _assetIdx += 1;
  const idx = _assetIdx;
  return {
    id: `demo-asset-${String(idx).padStart(4, '0')}`,
    asset_id: p.asset_id,
    name: p.name,
    asset_owner: p.asset_owner ?? OWNERS[idx % OWNERS.length],
    business_unit: p.business_unit ?? BUS[idx % BUS.length],
    physical_location: p.physical_location ?? SITES[idx % SITES.length],
    criticality: p.criticality,
    details: p.details ?? '',
    governed_status: p.governed_status ?? (idx % 3 === 0 ? 'Non-Governed' : 'Governed'),
    vulnerability_count: p.vulnerability_count ?? 0,
    exposure: p.exposure,
    category: p.category,
    ip_address: p.ip_address ?? null,
    mac_id: p.mac_id ?? null,
    source: p.source ?? 'Manual',
    nn_controls: p.nn_controls ?? null,
    org_id: DEMO_ORG_ID,
    user_id: DEMO_USER_ID,
    created_at: ts(-90 + (idx % 60)),
    custom_fields: p.custom_fields ?? null,
  };
};

// ─── BU root assets (anchors for org-view relationships) ──────────────────────
const buRoots: Asset[] = BUS.map((bu, i) => mkAsset({
  asset_id: `BU-${bu.toUpperCase().slice(0, 4)}`,
  name: `${bu} Business Unit`,
  category: 'Personnel Matrix',
  criticality: 'High',
  exposure: 'Internal',
  business_unit: bu,
  physical_location: 'New York',
  asset_owner: OWNERS[i],
  details: `Top-level org node for ${bu}. Anchor for org-view drilldown.`,
  governed_status: 'Governed',
}));

// ─── Site assets (one per site, anchors location-based grouping) ──────────────
const siteRoots: Asset[] = SITES.map((site, i) => mkAsset({
  asset_id: `SITE-${site.replace(/\s+/g, '').toUpperCase().slice(0, 4)}`,
  name: `${site} Office`,
  category: 'Physical/Hardware',
  criticality: 'High',
  exposure: 'Internal',
  business_unit: 'IT',
  physical_location: site,
  asset_owner: OWNERS[(i + 3) % OWNERS.length],
  details: `Physical ${site} office and data closet.`,
  governed_status: 'Governed',
}));

// ─── User endpoints (~25): laptops + desktops, spread across sites/BUs ───────
const endpointModels = [
  'MacBook Pro M3 14"', 'MacBook Air M2 13"', 'Dell Latitude 7440', 'Dell XPS 15',
  'HP EliteBook 840 G10', 'Lenovo ThinkPad X1 Carbon', 'Surface Laptop 5',
];
const endpoints: Asset[] = [];
for (let i = 0; i < 25; i++) {
  const site = SITES[i % SITES.length];
  const bu = BUS[i % BUS.length];
  const model = endpointModels[i % endpointModels.length];
  const isLaptop = i % 4 !== 0;
  endpoints.push(mkAsset({
    asset_id: `EP-${String(i + 1).padStart(3, '0')}`,
    name: `${isLaptop ? 'Laptop' : 'Desktop'} ${model.split(' ')[0]}-${String(i + 1).padStart(3, '0')}`,
    category: 'User Endpoints',
    criticality: i % 7 === 0 ? 'High' : (i % 3 === 0 ? 'Medium' : 'Low'),
    exposure: 'Internal',
    business_unit: bu,
    physical_location: site,
    ip_address: `10.${SITES.indexOf(site) + 10}.${Math.floor(i / 10) + 1}.${(i % 50) + 100}`,
    mac_id: `AA:BB:${String(i + 16).padStart(2, '0')}:${String(i + 32).padStart(2, '0')}:CC:DD`,
    details: `${model} assigned to ${bu} staff in ${site}. AV+EDR enrolled.`,
    vulnerability_count: i % 5,
    governed_status: i % 6 === 0 ? 'Non-Governed' : 'Governed',
  }));
}

// ─── Mobile devices (~10): iPhones, iPads ─────────────────────────────────────
const mobileModels = ['iPhone 15 Pro', 'iPhone 14', 'iPad Pro 12.9"', 'Samsung Galaxy S24'];
const mobiles: Asset[] = [];
for (let i = 0; i < 10; i++) {
  mobiles.push(mkAsset({
    asset_id: `MOB-${String(i + 1).padStart(3, '0')}`,
    name: `${mobileModels[i % mobileModels.length]} #${i + 1}`,
    category: 'Mobile Assets',
    criticality: i % 3 === 0 ? 'High' : 'Medium',
    exposure: 'External',
    business_unit: BUS[i % BUS.length],
    physical_location: SITES[i % SITES.length],
    details: `MDM-enrolled (Intune). Used by mobile journalist / executive.`,
    vulnerability_count: i % 3,
    governed_status: 'Governed',
  }));
}

// ─── Servers (~15): mix of virtual, physical, DCs, app servers ────────────────
const serverSpecs = [
  { name: 'Active Directory DC-01', loc: 'New York', bu: 'IT', crit: 'High' as const },
  { name: 'Active Directory DC-02', loc: 'London', bu: 'IT', crit: 'High' as const },
  { name: 'Exchange Mailbox Server', loc: 'New York', bu: 'IT', crit: 'High' as const },
  { name: 'File Server NAS-Primary', loc: 'New York', bu: 'Editorial', crit: 'High' as const },
  { name: 'File Server NAS-Sydney', loc: 'Sydney', bu: 'Broadcast', crit: 'Medium' as const },
  { name: 'CMS Database (Postgres)', loc: 'New York', bu: 'Digital', crit: 'High' as const },
  { name: 'Web App Server WEB-01', loc: 'London', bu: 'Digital', crit: 'High' as const },
  { name: 'Web App Server WEB-02', loc: 'London', bu: 'Digital', crit: 'High' as const },
  { name: 'Video Transcoding Cluster', loc: 'New York', bu: 'Broadcast', crit: 'High' as const },
  { name: 'Backup Server VEEAM-01', loc: 'New York', bu: 'IT', crit: 'Medium' as const },
  { name: 'Print Server SP-NYC', loc: 'New York', bu: 'IT', crit: 'Low' as const },
  { name: 'DNS Server DNS-01', loc: 'Bangalore', bu: 'IT', crit: 'High' as const },
  { name: 'Jump Host BASTION-01', loc: 'Singapore', bu: 'IT', crit: 'High' as const },
  { name: 'Internal Wiki (Confluence)', loc: 'New York', bu: 'IT', crit: 'Medium' as const },
  { name: 'Code Repository (GitLab)', loc: 'Bangalore', bu: 'Digital', crit: 'High' as const },
];
const servers: Asset[] = serverSpecs.map((s, i) => mkAsset({
  asset_id: `SRV-${String(i + 1).padStart(3, '0')}`,
  name: s.name,
  category: 'Virtual & On-Prem Servers',
  criticality: s.crit,
  exposure: i % 5 === 0 ? 'DMZ' : 'Internal',
  business_unit: s.bu,
  physical_location: s.loc,
  ip_address: `172.16.${i + 1}.10`,
  details: s.name + ' — RHEL 9 / Win Server 2022.',
  vulnerability_count: i % 4,
}));

// ─── Network & physical security (~10) ────────────────────────────────────────
const networkSpecs = [
  { name: 'Palo Alto Firewall PA-5410 (Perimeter NYC)', loc: 'New York', expo: 'External' as const },
  { name: 'Palo Alto Firewall PA-3260 (Perimeter LON)', loc: 'London', expo: 'External' as const },
  { name: 'Fortinet FortiGate (DMZ)', loc: 'New York', expo: 'DMZ' as const },
  { name: 'Cisco Catalyst 9300 (Core Switch NYC)', loc: 'New York', expo: 'Internal' as const },
  { name: 'Cisco Catalyst 9200 (Core Switch LON)', loc: 'London', expo: 'Internal' as const },
  { name: 'Cisco ASA VPN Concentrator', loc: 'New York', expo: 'External' as const },
  { name: 'Aruba Wi-Fi Controller (Floor-wide APs)', loc: 'Bangalore', expo: 'Internal' as const },
  { name: 'CCTV NVR (Studio Floor)', loc: 'New York', expo: 'Internal' as const },
  { name: 'Badge Access Controller (HID)', loc: 'New York', expo: 'Internal' as const },
  { name: 'F5 Load Balancer (Public CMS)', loc: 'London', expo: 'External' as const },
];
const network: Asset[] = networkSpecs.map((n, i) => mkAsset({
  asset_id: `NET-${String(i + 1).padStart(3, '0')}`,
  name: n.name,
  category: 'Network & Physical Security',
  criticality: i % 4 === 0 ? 'High' : 'Medium',
  exposure: n.expo,
  business_unit: 'IT',
  physical_location: n.loc,
  ip_address: `192.168.${i + 1}.1`,
  details: n.name + ' — managed by network ops.',
  vulnerability_count: i % 3,
}));

// ─── Cloud assets (~15): AWS / Azure / GCP / SaaS ─────────────────────────────
const cloudSpecs = [
  { name: 'AWS S3 — abcnews-cms-media', expo: 'External' as const, bu: 'Digital', loc: 'New York', det: 'Public-readable media bucket fronting the CMS. Versioning on. Lifecycle to Glacier after 365d.' },
  { name: 'AWS S3 — abcnews-newsroom-archive', expo: 'Internal' as const, bu: 'Editorial', loc: 'New York', det: 'Private archive of raw footage. SSE-KMS. Object Lock for 7y retention.' },
  { name: 'AWS EKS — cms-prod-eks', expo: 'External' as const, bu: 'Digital', loc: 'London', det: 'Production Kubernetes cluster (3 nodegroups). CMS, GraphQL gateway, breaking-news service.' },
  { name: 'AWS EC2 — c6i.4xlarge × 8 (Transcode Fleet)', expo: 'Internal' as const, bu: 'Broadcast', loc: 'New York', det: 'Video transcoding ASG. Scaled by SQS depth.' },
  { name: 'AWS RDS — abcnews-cms-postgres', expo: 'Internal' as const, bu: 'Digital', loc: 'London', det: 'Multi-AZ Postgres 15. PII inside — KMS-encrypted, snapshots to glacier.' },
  { name: 'AWS CloudFront — www.abcnews.com', expo: 'External' as const, bu: 'Digital', loc: 'New York', det: 'CDN fronting the public site. WAF v2 with managed + custom rules.' },
  { name: 'Azure App Service — investor-portal', expo: 'External' as const, bu: 'Finance', loc: 'London', det: 'Investor-relations portal. Azure AD B2C auth.' },
  { name: 'Azure AKS — analytics-prod', expo: 'Internal' as const, bu: 'Digital', loc: 'Singapore', det: 'Analytics pipeline (Kafka + Spark) running on AKS.' },
  { name: 'Azure Blob Storage — analytics-raw', expo: 'Internal' as const, bu: 'Digital', loc: 'Singapore', det: 'Raw analytics events landing zone.' },
  { name: 'GCP GKE — recommender-prod', expo: 'External' as const, bu: 'Digital', loc: 'Bangalore', det: 'ML recommender microservice cluster.' },
  { name: 'GCP Cloud SQL — recommender-pg', expo: 'Internal' as const, bu: 'Digital', loc: 'Bangalore', det: 'Recommender feature store.' },
  { name: 'Microsoft 365 — Tenant abcnews.onmicrosoft.com', expo: 'External' as const, bu: 'IT', loc: 'New York', det: 'Email, OneDrive, Teams, SharePoint. SSO via Azure AD.' },
  { name: 'Okta — Identity Tenant', expo: 'External' as const, bu: 'IT', loc: 'New York', det: 'Primary IdP. MFA enforced for all admin roles.' },
  { name: 'GitHub Enterprise — abcnews-org', expo: 'External' as const, bu: 'Digital', loc: 'New York', det: 'Source repos. SSO-gated; SECRETSCAN + Dependabot enabled.' },
  { name: 'Slack — abcnews.slack.com', expo: 'External' as const, bu: 'IT', loc: 'New York', det: 'Internal comms + breaking-news channels. SCIM provisioned.' },
];
const cloud: Asset[] = cloudSpecs.map((c, i) => mkAsset({
  asset_id: `CLD-${String(i + 1).padStart(3, '0')}`,
  name: c.name,
  category: 'Cloud Services & SaaS',
  criticality: i < 7 ? 'High' : (i < 12 ? 'Medium' : 'Low'),
  exposure: c.expo,
  business_unit: c.bu,
  physical_location: c.loc,
  details: c.det,
  vulnerability_count: i % 4,
  governed_status: i === 4 || i === 9 ? 'Non-Governed' : 'Governed',
}));

// ─── Information / data assets (~5) ───────────────────────────────────────────
const dataSpecs = [
  { name: 'Subscriber PII Database', bu: 'Digital', crit: 'High' as const },
  { name: 'Anchor Talent Contracts', bu: 'Legal', crit: 'High' as const },
  { name: 'Editorial Source Confidential Index', bu: 'Editorial', crit: 'High' as const },
  { name: 'Financial Statements (Quarterly)', bu: 'Finance', crit: 'High' as const },
  { name: 'Employee Records (HRIS Export)', bu: 'HR', crit: 'High' as const },
];
const dataAssets: Asset[] = dataSpecs.map((d, i) => mkAsset({
  asset_id: `DAT-${String(i + 1).padStart(3, '0')}`,
  name: d.name,
  category: 'Information & Data Assets',
  criticality: d.crit,
  exposure: 'Internal',
  business_unit: d.bu,
  physical_location: 'New York',
  details: d.name + ' — classified CONFIDENTIAL. Access via role-based ACL.',
  vulnerability_count: 0,
}));

export const SEED_ASSETS: Asset[] = [
  ...buRoots, ...siteRoots, ...endpoints, ...mobiles, ...servers, ...network, ...cloud, ...dataAssets,
];

// ─── Asset relationships (build a sensible org-view graph) ────────────────────
// IMPORTANT: source_asset_id / target_asset_id store the *human* asset_id
// (e.g. "EP-001"), not the UUID — matches what server/src/routes/assets.js queries.
// OrgDiagramView's Mermaid builder also keys edges by asset.asset_id.
const SEED_ASSET_RELATIONSHIPS: AssetRelationship[] = [];
let _relIdx = 0;
const mkRel = (sourceAssetId: string, targetAssetId: string, type: string): AssetRelationship => {
  _relIdx += 1;
  return {
    id: `demo-rel-${String(_relIdx).padStart(4, '0')}`,
    source_asset_id: sourceAssetId,
    target_asset_id: targetAssetId,
    relationship_type: type,
    created_at: ts(-30),
  };
};

const findAsset = (predicate: (a: Asset) => boolean): Asset | undefined => SEED_ASSETS.find(predicate);

// Every non-root asset → owned by its BU root + located at its site root
SEED_ASSETS.forEach(a => {
  if (a.asset_id.startsWith('BU-') || a.asset_id.startsWith('SITE-')) return;
  const buRoot = findAsset(x => x.asset_id === `BU-${(a.business_unit || '').toUpperCase().slice(0, 4)}`);
  const siteRoot = findAsset(x => x.asset_id === `SITE-${(a.physical_location || '').replace(/\s+/g, '').toUpperCase().slice(0, 4)}`);
  if (buRoot) SEED_ASSET_RELATIONSHIPS.push(mkRel(buRoot.asset_id, a.asset_id, 'owns'));
  if (siteRoot) SEED_ASSET_RELATIONSHIPS.push(mkRel(a.asset_id, siteRoot.asset_id, 'located_at'));
});

// Targeted dependency chains (give the visualizer some narrative)
const byAssetId = (aid: string) => SEED_ASSETS.find(a => a.asset_id === aid);
const chain = (pairs: [string, string, string][]) => {
  pairs.forEach(([src, tgt, type]) => {
    const s = byAssetId(src); const t = byAssetId(tgt);
    if (s && t) SEED_ASSET_RELATIONSHIPS.push(mkRel(s.asset_id, t.asset_id, type));
  });
};
chain([
  ['CLD-006', 'CLD-001', 'serves'],          // CloudFront → S3 media
  ['CLD-006', 'CLD-003', 'serves'],          // CloudFront → EKS prod
  ['CLD-003', 'CLD-005', 'depends_on'],      // EKS → RDS
  ['CLD-002', 'CLD-001', 'feeds'],           // archive → media
  ['SRV-006', 'CLD-005', 'replicates_to'],   // on-prem CMS DB → RDS
  ['SRV-007', 'CLD-003', 'depends_on'],      // WEB-01 → EKS
  ['SRV-008', 'CLD-003', 'depends_on'],      // WEB-02 → EKS
  ['SRV-009', 'CLD-004', 'depends_on'],      // Transcode → EC2 fleet
  ['NET-001', 'SRV-007', 'protects'],        // Firewall → WEB-01
  ['NET-001', 'SRV-008', 'protects'],        // Firewall → WEB-02
  ['NET-006', 'SRV-013', 'protects'],        // VPN → bastion
  ['CLD-013', 'SRV-015', 'integrates_with'], // GitHub → GitLab mirror
  ['CLD-012', 'CLD-013', 'authenticates'],   // Okta → GitHub
  ['CLD-012', 'CLD-011', 'authenticates'],   // Okta → M365
]);
export { SEED_ASSET_RELATIONSHIPS };

// ─── Policies (~15) — one master + a mix of statuses ──────────────────────────
const policyDefs: { name: string; status: PolicyV2['policy_status']; isMaster?: boolean }[] = [
  { name: 'Information Security Policy', status: 'approved', isMaster: true },
  { name: 'Acceptable Use Policy', status: 'approved' },
  { name: 'Access Control Policy', status: 'approved' },
  { name: 'Data Classification & Handling Policy', status: 'approved' },
  { name: 'Cryptography & Key Management Policy', status: 'approved' },
  { name: 'Incident Response Policy', status: 'approved' },
  { name: 'Business Continuity & DR Policy', status: 'in_approval' },
  { name: 'Vendor & Third-Party Risk Policy', status: 'in_approval' },
  { name: 'Asset Management Policy', status: 'approved' },
  { name: 'Vulnerability Management Policy', status: 'to_review' },
  { name: 'Change Management Policy', status: 'to_review' },
  { name: 'Logging & Monitoring Policy', status: 'draft' },
  { name: 'Bring Your Own Device (BYOD) Policy', status: 'draft' },
  { name: 'Cloud Security Policy', status: 'reviewed' },
  { name: 'Privacy & PII Protection Policy', status: 'in_approval' },
];

export const SEED_POLICIES: PolicyV2[] = policyDefs.map((p, i) => ({
  policy_id: `demo-policy-${String(i + 1).padStart(3, '0')}`,
  name: p.name,
  markdown: `# ${p.name}\n\n## Purpose\nThis policy establishes the ABC News standard for ${p.name.toLowerCase()}.\n\n## Scope\nApplies to all ABC News employees, contractors, and third parties accessing ABC News systems.\n\n## Policy\n${'- Statement of intent and applicability.\n'.repeat(3)}\n## Roles & Responsibilities\n- **CISO** — owns this policy.\n- **Department Heads** — enforce within their teams.\n\n## Review\nReviewed annually. Last review: ${ts(-90 + i * 5).split('T')[0]}.`,
  policy_ref: `POL-${String(i + 1).padStart(3, '0')}`,
  policy_status: p.status,
  refresh_date: ts(270 + i * 5).split('T')[0],
  version: i === 0 ? '2.1' : '1.0',
  document_type: 'Policy',
  owner_name: OWNERS[i % OWNERS.length],
  is_master: p.isMaster ?? false,
  org_id: DEMO_ORG_ID,
  user_id: DEMO_USER_ID,
  created_at: ts(-180 + i * 7),
  updated_at: ts(-30 + i),
}));

// ─── Vulnerabilities (~40): mix of sources / statuses, attached to assets ────
const vulnTemplates = [
  { name: 'CVE-2024-21413 — Outlook RCE', desc: 'Microsoft Outlook remote code execution via crafted email.' },
  { name: 'CVE-2024-3094 — XZ Utils backdoor', desc: 'Malicious code injected into xz-utils 5.6.0/5.6.1.' },
  { name: 'CVE-2023-44487 — HTTP/2 Rapid Reset', desc: 'Denial of service via HTTP/2 stream cancellation.' },
  { name: 'CVE-2023-23397 — Outlook Elevation of Privilege', desc: 'NTLM hash leak via crafted appointment.' },
  { name: 'CVE-2023-4863 — libwebp heap overflow', desc: 'Heap buffer overflow in WebP image processing.' },
  { name: 'Unrestricted S3 bucket policy', desc: 'S3 bucket policy allows GetObject from *. Public exposure.' },
  { name: 'Missing MFA on AWS root account', desc: 'AWS root user has no MFA configured.' },
  { name: 'Outdated TLS 1.0 on legacy endpoint', desc: 'Legacy CMS endpoint still negotiates TLS 1.0.' },
  { name: 'Weak SSH ciphers on bastion host', desc: 'Bastion accepts CBC-mode ciphers and SHA1 HMACs.' },
  { name: 'Default credentials on print server', desc: 'Admin/admin still active on legacy print server.' },
  { name: 'Hardcoded API key in GitHub repo', desc: 'Stripe live key found in committed config file.' },
  { name: 'Unpatched Apache Log4j 2.14', desc: 'Log4Shell remediation incomplete on internal wiki.' },
  { name: 'Open RDP port to internet', desc: 'Server SRV-013 exposes 3389 to 0.0.0.0/0.' },
  { name: 'Stale local admin account', desc: 'Stale local administrator on AD with 400+ day password.' },
  { name: 'Missing endpoint encryption (FileVault)', desc: 'Several MacBook endpoints have FileVault disabled.' },
];
const vulnStatusMix: Vulnerability['status'][] = ['Planned', 'Remediated', 'NA', 'Planned', 'Planned'];
const vulnSourceMix: Vulnerability['derived_from'][] = ['KEV', 'Scanning', 'PT', 'Reported-Ext', 'Scanning'];

export const SEED_VULNERABILITIES: Vulnerability[] = [];
for (let i = 0; i < 40; i++) {
  const t = vulnTemplates[i % vulnTemplates.length];
  // Distribute across endpoints/servers/network/cloud (skip BU/site roots)
  const targets = SEED_ASSETS.filter(a => !a.asset_id.startsWith('BU-') && !a.asset_id.startsWith('SITE-'));
  const target = targets[i % targets.length];
  SEED_VULNERABILITIES.push({
    id: `demo-vuln-${String(i + 1).padStart(4, '0')}`,
    name: `${t.name}${i >= vulnTemplates.length ? ` (#${Math.floor(i / vulnTemplates.length) + 1})` : ''}`,
    description: t.desc,
    derived_from: vulnSourceMix[i % vulnSourceMix.length],
    status: vulnStatusMix[i % vulnStatusMix.length],
    created_at: ts(-60 + i),
    updated_at: ts(-10 + (i % 10)),
    asset_id: target.id,
    assets: { asset_id: target.asset_id, name: target.name },
  });
}

// ─── Capabilities (~12) ───────────────────────────────────────────────────────
const capabilityDefs = [
  { name: 'Endpoint Detection & Response (EDR)', provider: ['CrowdStrike Falcon'], cmdb: ['CMDB-EDR-001'] },
  { name: 'Identity & Access Management', provider: ['Okta', 'Azure AD'], cmdb: ['CMDB-IAM-001'] },
  { name: 'Network Segmentation', provider: ['Cisco', 'Palo Alto'], cmdb: ['CMDB-NET-001'] },
  { name: 'Data Loss Prevention', provider: ['Symantec DLP'], cmdb: ['CMDB-DLP-001'] },
  { name: 'Encryption at Rest', provider: ['AWS KMS', 'Azure Key Vault'], cmdb: ['CMDB-CRYPTO-001'] },
  { name: 'SIEM & SOC Monitoring', provider: ['Splunk', 'Elastic SIEM'], cmdb: ['CMDB-SIEM-001'] },
  { name: 'Backup & Recovery', provider: ['Veeam', 'AWS Backup'], cmdb: ['CMDB-BCK-001'] },
  { name: 'Vulnerability Scanning', provider: ['Tenable Nessus', 'AWS Inspector'], cmdb: ['CMDB-VM-001'] },
  { name: 'Email Security & Anti-Phish', provider: ['Mimecast', 'Microsoft Defender'], cmdb: ['CMDB-MAIL-001'] },
  { name: 'Cloud Security Posture Mgmt', provider: ['Wiz'], cmdb: ['CMDB-CSPM-001'] },
  { name: 'Secrets Management', provider: ['HashiCorp Vault'], cmdb: ['CMDB-SEC-001'] },
  { name: 'Security Awareness Training', provider: ['KnowBe4'], cmdb: ['CMDB-AWR-001'] },
];

export const SEED_CAPABILITIES: Capability[] = capabilityDefs.map((c, i) => ({
  id: `demo-cap-${String(i + 1).padStart(3, '0')}`,
  capab_id: `CAP-${String(i + 1).padStart(3, '0')}`,
  capab_name: c.name,
  capab_provider: c.provider,
  capab_cmdb_id: c.cmdb,
  capab_owner: OWNERS[i % OWNERS.length],
  capab_other_details: `Coverage: org-wide. Renewal due ${ts(180 + i * 10).split('T')[0]}.`,
  org_id: DEMO_ORG_ID,
  user_id: DEMO_USER_ID,
  created_at: ts(-200 + i * 5),
  updated_at: ts(-15),
}));

// ─── Control Registry (~25) — mix of statuses + types ─────────────────────────
const controlDefs: { name: string; fw: string; type: ControlRegistry['ctl_type']; enf: ControlRegistry['enforcement_type']; status: ControlRegistry['ctl_status'] }[] = [
  { name: 'Multi-Factor Authentication enforced for all users', fw: 'ISO 27001 A.9.4', type: 'Standard', enf: 'org_wide', status: 'Enforced' },
  { name: 'Privileged Access Workstation for admins', fw: 'NIST CSF PR.AC-4', type: 'NN', enf: 'org_wide', status: 'Enforced' },
  { name: 'Quarterly access review for production systems', fw: 'SOC 2 CC6.3', type: 'Regulatory', enf: 'org_wide', status: 'In-Review' },
  { name: 'Encryption at rest for all PII data', fw: 'GDPR Art.32', type: 'Regulatory', enf: 'org_wide', status: 'Enforced' },
  { name: 'TLS 1.2+ on all internet-facing endpoints', fw: 'PCI DSS 4.0 r4.2', type: 'Regulatory', enf: 'org_wide', status: 'Enforced' },
  { name: 'Backup integrity tested quarterly', fw: 'ISO 27001 A.12.3', type: 'Standard', enf: 'org_wide', status: 'In-Review' },
  { name: 'Annual phishing simulation campaign', fw: 'NIST CSF PR.AT-1', type: 'Standard', enf: 'org_wide', status: 'Enforced' },
  { name: 'Web Application Firewall in front of public CMS', fw: 'OWASP', type: 'NN', enf: 'Asset_specific', status: 'Enforced' },
  { name: 'SAST + secret scanning on all repos', fw: 'NIST CSF DE.CM-8', type: 'NN', enf: 'org_wide', status: 'Enforced' },
  { name: 'Vendor security questionnaire before onboarding', fw: 'ISO 27001 A.15.1', type: 'Standard', enf: 'org_wide', status: 'In-Review' },
  { name: 'Centralized log aggregation (90 day retention)', fw: 'SOC 2 CC7.2', type: 'Regulatory', enf: 'org_wide', status: 'NotEnforced' },
  { name: 'Quarterly penetration test of public assets', fw: 'PCI DSS 4.0 r11.4', type: 'Regulatory', enf: 'org_wide', status: 'Enforced' },
  { name: 'Asset inventory reconciled monthly', fw: 'CIS Control 1', type: 'Standard', enf: 'org_wide', status: 'Enforced' },
  { name: 'Just-in-time elevation for cloud admin roles', fw: 'NIST CSF PR.AC-7', type: 'NN', enf: 'org_wide', status: 'In-Review' },
  { name: 'Data classification labels enforced in M365', fw: 'ISO 27001 A.8.2', type: 'Standard', enf: 'org_wide', status: 'NotEnforced' },
  { name: 'BYOD requires Intune enrollment', fw: 'NIST CSF PR.AC-3', type: 'Custom', enf: 'BU_specific', status: 'Enforced' },
  { name: 'Quarterly DR test of primary newsroom', fw: 'ISO 22301', type: 'Regulatory', enf: 'org_wide', status: 'NotEnforced' },
  { name: 'Vulnerability remediation SLA (Crit 7d, High 30d)', fw: 'NIST CSF RS.MI-3', type: 'Standard', enf: 'org_wide', status: 'In-Review' },
  { name: 'Signed code commits for production repos', fw: 'NIST CSF PR.IP-3', type: 'Custom', enf: 'org_wide', status: 'NotEnforced' },
  { name: 'Hardware-backed FIDO2 keys for journalists in hostile regions', fw: 'NIST CSF PR.AC-7', type: 'NN', enf: 'BU_specific', status: 'Enforced' },
  { name: 'Mandatory annual security training', fw: 'ISO 27001 A.7.2', type: 'Standard', enf: 'org_wide', status: 'Enforced' },
  { name: 'Production change requires CAB approval', fw: 'ITIL Change', type: 'Standard', enf: 'org_wide', status: 'Enforced' },
  { name: 'CrowdStrike installed on all corporate endpoints', fw: 'CIS Control 10', type: 'Standard', enf: 'org_wide', status: 'Enforced' },
  { name: 'PII data minimization review (annual)', fw: 'GDPR Art.5', type: 'Regulatory', enf: 'org_wide', status: 'NotEnforced' },
  { name: 'Network egress filtering on production VPCs', fw: 'NIST CSF PR.AC-5', type: 'NN', enf: 'org_wide', status: 'In-Review' },
];

export const SEED_CONTROL_REGISTRY: ControlRegistry[] = controlDefs.map((c, i) => ({
  id: `demo-ctlreg-${String(i + 1).padStart(3, '0')}`,
  ctl_id: `CTL-${String(i + 1).padStart(3, '0')}`,
  ctl_name: c.name,
  ctl_status: c.status,
  ctl_type: c.type,
  enforcement_type: c.enf,
  ctl_description: c.name + ' — applied across the ABC News estate.',
  ctld_by: [OWNERS[i % OWNERS.length]],
  ctl_ref_fw: c.fw,
  ctl_other_details: null,
  evidence_metadata: null,
  enforced_by: c.status === 'Enforced' ? OWNERS[i % OWNERS.length] : null,
  reviewed_by: c.status === 'In-Review' ? OWNERS[(i + 1) % OWNERS.length] : null,
  org_id: DEMO_ORG_ID,
  user_id: DEMO_USER_ID,
  created_at: ts(-160 + i * 5),
  updated_at: ts(-5),
}));

// ─── Internal Controls (~25) — aligned to ISO 27001 ───────────────────────────
const internalControlDefs: { ctl_id: string; name: string; tags: string[]; status: InternalControl['status'] }[] = [
  { ctl_id: 'IC-A.5.1', name: 'Information security policies', tags: ['ISO 27001', 'SOC 2'], status: 'Enforced' },
  { ctl_id: 'IC-A.6.1', name: 'Information security roles and responsibilities', tags: ['ISO 27001'], status: 'Enforced' },
  { ctl_id: 'IC-A.7.2', name: 'Information security awareness, education and training', tags: ['ISO 27001', 'NIST CSF'], status: 'Enforced' },
  { ctl_id: 'IC-A.8.1', name: 'Inventory of information and other associated assets', tags: ['ISO 27001'], status: 'Enforced' },
  { ctl_id: 'IC-A.8.2', name: 'Information classification', tags: ['ISO 27001', 'GDPR'], status: 'InProgress' },
  { ctl_id: 'IC-A.8.3', name: 'Information labelling', tags: ['ISO 27001'], status: 'Not-Enforced' },
  { ctl_id: 'IC-A.9.1', name: 'Access control policy', tags: ['ISO 27001', 'SOC 2'], status: 'Enforced' },
  { ctl_id: 'IC-A.9.2', name: 'User access management', tags: ['ISO 27001'], status: 'Enforced' },
  { ctl_id: 'IC-A.9.3', name: 'User responsibilities', tags: ['ISO 27001'], status: 'Enforced' },
  { ctl_id: 'IC-A.9.4', name: 'System and application access control', tags: ['ISO 27001', 'PCI DSS'], status: 'Enforced' },
  { ctl_id: 'IC-A.10.1', name: 'Cryptographic controls', tags: ['ISO 27001', 'GDPR'], status: 'Enforced' },
  { ctl_id: 'IC-A.11.1', name: 'Physical security perimeter', tags: ['ISO 27001'], status: 'Enforced' },
  { ctl_id: 'IC-A.12.1', name: 'Operational procedures and responsibilities', tags: ['ISO 27001'], status: 'InProgress' },
  { ctl_id: 'IC-A.12.2', name: 'Protection from malware', tags: ['ISO 27001', 'NIST CSF'], status: 'Enforced' },
  { ctl_id: 'IC-A.12.3', name: 'Backup', tags: ['ISO 27001', 'SOC 2'], status: 'InProgress' },
  { ctl_id: 'IC-A.12.4', name: 'Logging and monitoring', tags: ['ISO 27001', 'SOC 2'], status: 'Not-Enforced' },
  { ctl_id: 'IC-A.12.6', name: 'Technical vulnerability management', tags: ['ISO 27001', 'NIST CSF'], status: 'InProgress' },
  { ctl_id: 'IC-A.13.1', name: 'Network security management', tags: ['ISO 27001'], status: 'Enforced' },
  { ctl_id: 'IC-A.13.2', name: 'Information transfer', tags: ['ISO 27001'], status: 'Enforced' },
  { ctl_id: 'IC-A.14.1', name: 'Security requirements of information systems', tags: ['ISO 27001'], status: 'InProgress' },
  { ctl_id: 'IC-A.15.1', name: 'Information security in supplier relationships', tags: ['ISO 27001'], status: 'InProgress' },
  { ctl_id: 'IC-A.16.1', name: 'Management of information security incidents', tags: ['ISO 27001'], status: 'Enforced' },
  { ctl_id: 'IC-A.17.1', name: 'Information security continuity', tags: ['ISO 27001', 'ISO 22301'], status: 'Not-Enforced' },
  { ctl_id: 'IC-A.18.1', name: 'Compliance with legal and contractual requirements', tags: ['GDPR'], status: 'Enforced' },
  { ctl_id: 'IC-A.18.2', name: 'Information security reviews', tags: ['ISO 27001'], status: 'InProgress' },
];

export const SEED_INTERNAL_CONTROLS: InternalControl[] = internalControlDefs.map((c, i) => ({
  id: `demo-ic-${String(i + 1).padStart(3, '0')}`,
  ctl_id: c.ctl_id,
  name: c.name,
  description: `ISO 27001 Annex A control: ${c.name}.`,
  status: c.status,
  evidence_file_url: null,
  compliance_tag3: c.tags,
  updated_at: ts(-20 + (i % 20)),
}));

// ─── Compliance entries (~10) — multi-framework ───────────────────────────────
const complianceDefs: { framework: string; status: Compliance['status']; description: string }[] = [
  { framework: 'ISO 27001:2022', status: 'In Progress', description: 'Information Security Management System certification readiness.' },
  { framework: 'SOC 2 Type II', status: 'In Progress', description: 'Security, Availability, Confidentiality trust services criteria.' },
  { framework: 'GDPR', status: 'Achieved', description: 'EU General Data Protection Regulation compliance.' },
  { framework: 'CCPA', status: 'Achieved', description: 'California Consumer Privacy Act.' },
  { framework: 'HIPAA', status: 'Not Started', description: 'Healthcare data protection (relevant if ABC News health editorial covers PHI).' },
  { framework: 'PCI DSS 4.0', status: 'In Progress', description: 'For online subscription billing.' },
  { framework: 'NIST CSF 2.0', status: 'In Progress', description: 'NIST Cybersecurity Framework alignment.' },
  { framework: 'ISO 22301', status: 'Not Started', description: 'Business Continuity Management.' },
  { framework: 'CIS Controls v8', status: 'Achieved', description: 'CIS top 18 controls baseline.' },
  { framework: 'CSA STAR Level 1', status: 'Achieved', description: 'Cloud Security Alliance attestation.' },
];

export const SEED_COMPLIANCE: Compliance[] = complianceDefs.map((c, i) => ({
  id: `demo-comp-${String(i + 1).padStart(3, '0')}`,
  compliance_id: `COMP-${String(i + 1).padStart(3, '0')}`,
  framework: c.framework,
  description: c.description,
  status: c.status,
  updated_at: ts(-7 + i),
  associated_int_ctls: SEED_INTERNAL_CONTROLS.slice(i, i + 5).map(ic => ic.ctl_id),
}));

// ─── Contacts (~15) — org leadership/security team ────────────────────────────
const contactDefs: { name: string; title: string; level: number; email: string; sec_role: string }[] = [
  { name: 'Sarah Chen', title: 'Chief Executive Officer', level: 1, email: 'sarah.chen@abcnews.example', sec_role: 'Executive Sponsor' },
  { name: 'James Mitchell', title: 'Chief Information Security Officer', level: 2, email: 'james.mitchell@abcnews.example', sec_role: 'CISO' },
  { name: 'Priya Sharma', title: 'Chief Technology Officer', level: 2, email: 'priya.sharma@abcnews.example', sec_role: 'CTO' },
  { name: 'Marcus Johnson', title: 'Chief Financial Officer', level: 2, email: 'marcus.johnson@abcnews.example', sec_role: 'Executive' },
  { name: 'Elena Rodriguez', title: 'Head of Editorial', level: 2, email: 'elena.rodriguez@abcnews.example', sec_role: 'BU Head' },
  { name: 'Akira Tanaka', title: 'Head of Broadcast', level: 2, email: 'akira.tanaka@abcnews.example', sec_role: 'BU Head' },
  { name: 'David Goldberg', title: 'Head of Digital', level: 2, email: 'david.goldberg@abcnews.example', sec_role: 'BU Head' },
  { name: 'Aisha Patel', title: 'Director of Security Operations', level: 3, email: 'aisha.patel@abcnews.example', sec_role: 'SecOps Lead' },
  { name: 'Liam O\'Brien', title: 'Director of Infrastructure', level: 3, email: 'liam.obrien@abcnews.example', sec_role: 'Infra Lead' },
  { name: 'Sophia Müller', title: 'Director of GRC', level: 3, email: 'sophia.muller@abcnews.example', sec_role: 'GRC Lead' },
  { name: 'Rahul Krishnan', title: 'Senior Security Engineer', level: 4, email: 'rahul.krishnan@abcnews.example', sec_role: 'Engineer' },
  { name: 'Naomi Walker', title: 'Senior Security Engineer', level: 4, email: 'naomi.walker@abcnews.example', sec_role: 'Engineer' },
  { name: 'Chen Wei', title: 'IAM Engineer', level: 4, email: 'chen.wei@abcnews.example', sec_role: 'IAM Engineer' },
  { name: 'Olivia Brooks', title: 'Privacy Counsel', level: 3, email: 'olivia.brooks@abcnews.example', sec_role: 'Legal/Privacy' },
  { name: 'Tomás García', title: 'GRC Analyst', level: 4, email: 'tomas.garcia@abcnews.example', sec_role: 'Analyst' },
];

export const SEED_CONTACTS: Contact[] = contactDefs.map((c, i) => ({
  id: `demo-contact-${String(i + 1).padStart(3, '0')}`,
  name: c.name,
  title: c.title,
  level: c.level,
  email: c.email,
  sec_role: c.sec_role,
  created_at: ts(-365 + i * 7),
}));

// Same names also surface as OrgContacts (members table)
export const SEED_ORG_CONTACTS: OrgContact[] = contactDefs.slice(0, 10).map((c, i) => ({
  id: `demo-orgcontact-${String(i + 1).padStart(3, '0')}`,
  org_id: DEMO_ORG_ID,
  name: c.name,
  email: c.email,
  department: c.title.replace(/^(Chief|Head of|Director of|Senior|)\s*/i, '').trim() || 'IT',
  created_at: ts(-365 + i * 7),
  updated_at: ts(-30),
}));

// ─── Program Tasks (~12) ──────────────────────────────────────────────────────
const programDefs: { name: string; desc: string; month: string; status: ProgramTask['status']; progress: number }[] = [
  { name: 'ISO 27001 Certification Sprint', desc: 'Close remaining 8 gaps before external audit window.', month: '2026-06', status: 'InProgress', progress: 65 },
  { name: 'SOC 2 Type II Readiness', desc: 'Evidence collection across CC1–CC9 trust services criteria.', month: '2026-07', status: 'InProgress', progress: 40 },
  { name: 'Logging & Monitoring Uplift', desc: 'Centralize all logs into Splunk; tune SIEM rules.', month: '2026-05', status: 'InProgress', progress: 55 },
  { name: 'Cloud Posture Remediation (Wiz findings)', desc: 'Close top 50 high-severity Wiz findings.', month: '2026-05', status: 'InProgress', progress: 70 },
  { name: 'Quarterly Phishing Campaign — Q2', desc: 'Run Q2 simulation, measure click-rate uplift.', month: '2026-06', status: 'Planned', progress: 0 },
  { name: 'DR Test — Primary Newsroom Failover', desc: 'Full table-top + live failover drill for newsroom CMS.', month: '2026-08', status: 'Planned', progress: 0 },
  { name: 'BYOD MDM Enrollment Drive', desc: 'Roll Intune enrollment to remaining 120 personal devices.', month: '2026-05', status: 'InProgress', progress: 30 },
  { name: 'Vendor Risk Re-Assessment (Tier 1)', desc: 'Re-questionnaire all Tier-1 vendors.', month: '2026-07', status: 'Planned', progress: 0 },
  { name: 'PII Data Mapping Refresh', desc: 'Update PII data flow diagrams; align with GDPR Art.30.', month: '2026-06', status: 'Blocked', progress: 15 },
  { name: 'Privileged Access Review', desc: 'Re-certify all production admin entitlements.', month: '2026-05', status: 'Completed', progress: 100 },
  { name: 'TLS 1.0 Decommissioning', desc: 'Decommission legacy TLS 1.0 endpoints.', month: '2026-04', status: 'Completed', progress: 100 },
  { name: 'Annual Pen Test — External', desc: 'External penetration test of public CMS + APIs.', month: '2026-09', status: 'Planned', progress: 0 },
];

export const SEED_PROGRAM_TASKS: ProgramTask[] = programDefs.map((p, i) => ({
  id: `demo-task-${String(i + 1).padStart(3, '0')}`,
  program_name: p.name,
  description: p.desc,
  month: p.month,
  due_date: `${p.month}-28`,
  assignee: OWNERS[i % OWNERS.length],
  status: p.status,
  progress_percent: p.progress,
  last_updated: ts(-3 - (i % 5)),
}));

// ─── Activity logs (~30) ──────────────────────────────────────────────────────
const activityActions = [
  { action: 'policy_approved', module: 'Policy', entity: 'Acceptable Use Policy' },
  { action: 'control_enforced', module: 'ControlRegistry', entity: 'Multi-Factor Authentication enforced for all users' },
  { action: 'vulnerability_remediated', module: 'Vulnerability', entity: 'CVE-2023-4863 — libwebp heap overflow' },
  { action: 'asset_created', module: 'Asset', entity: 'AWS S3 — abcnews-newsroom-archive' },
  { action: 'login', module: 'Authentication', entity: 'James Mitchell' },
  { action: 'task_completed', module: 'Program', entity: 'Privileged Access Review' },
  { action: 'policy_submitted_for_review', module: 'Policy', entity: 'Vulnerability Management Policy' },
  { action: 'compliance_updated', module: 'Compliance', entity: 'ISO 27001:2022' },
  { action: 'control_review_requested', module: 'ControlRegistry', entity: 'Quarterly access review for production systems' },
  { action: 'asset_governed', module: 'Asset', entity: 'Subscriber PII Database' },
];

export const SEED_ACTIVITY_LOGS: AllActivityLog[] = [];
for (let i = 0; i < 30; i++) {
  const a = activityActions[i % activityActions.length];
  const actor = contactDefs[i % contactDefs.length];
  SEED_ACTIVITY_LOGS.push({
    id: i + 1,
    user_id: DEMO_USER_ID,
    org_id: DEMO_ORG_ID,
    action: a.action,
    module: a.module,
    entity_id: null,
    entity_name: a.entity,
    event_data: null,
    ip_address: '10.10.1.42',
    user_agent: 'Mozilla/5.0 (demo)',
    severity: 'info',
    source: 'web_app',
    created_at: ts(-30 + i),
    contacts: { name: actor.name, email: actor.email },
    org_name: 'ABC News',
    user_role: 'tenant_admin',
  });
}
// Newest first (matches backend convention)
SEED_ACTIVITY_LOGS.reverse();

// ─── Scoring history (30 days) trending up to ~60% ────────────────────────────
export const SEED_SCORING_HISTORY: any[] = [];
for (let i = 30; i >= 1; i--) {
  // Trend: start ~50, end ~60, small noise
  const base = 50 + ((30 - i) / 30) * 10;
  const noise = (Math.sin(i * 0.9) + Math.cos(i * 0.7)) * 1.5;
  const score = Math.max(45, Math.min(65, base + noise));
  SEED_SCORING_HISTORY.push({
    snapshot_date: ts(-i).split('T')[0],
    total_assets: 80 - Math.floor(i / 6),
    total_controls: 25,
    total_tasks: 12,
    total_policies: 15,
    score: Math.round(score * 10) / 10,
    total_vulnerabilities: 40 + Math.floor(i / 4),
  });
}

// ─── Notifications + approvals (empty/minimal) ────────────────────────────────
export const SEED_POLICY_APPROVALS: PolicyApproval[] = [
  {
    id: 'demo-pol-app-001',
    policy_id: SEED_POLICIES.find(p => p.policy_status === 'in_approval')!.policy_id,
    requested_by: DEMO_USER_ID,
    approver_id: null,
    approver_name: 'James Mitchell',
    approver_email: 'james.mitchell@abcnews.example',
    status: 'pending',
    comment: null,
    org_id: DEMO_ORG_ID,
    created_at: ts(-2),
    updated_at: ts(-2),
  },
];

export const SEED_POLICY_NOTIFICATIONS: PolicyNotification[] = [
  {
    id: 'demo-pn-001',
    recipient_id: DEMO_USER_ID,
    policy_id: SEED_POLICIES[6].policy_id,
    policy_name: SEED_POLICIES[6].name,
    type: 'approval_requested',
    message: `Approval requested for "${SEED_POLICIES[6].name}".`,
    read: false,
    org_id: DEMO_ORG_ID,
    created_at: ts(-1),
  },
];

export const SEED_CONTROL_NOTIFICATIONS: ControlNotification[] = [
  {
    id: 'demo-cn-001',
    recipient_id: DEMO_USER_ID,
    control_id: SEED_CONTROL_REGISTRY[2].id,
    control_name: SEED_CONTROL_REGISTRY[2].ctl_name,
    type: 'review_requested',
    message: `Review requested for "${SEED_CONTROL_REGISTRY[2].ctl_name}".`,
    read: false,
    org_id: DEMO_ORG_ID,
    created_at: ts(-1),
  },
];

export const SEED_ORG_NOTIFICATIONS: OrgNotification[] = [];

// ─── Asset types + custom fields (minimal so dialogs don't break) ─────────────
export const SEED_ASSET_TYPES: { id: string; name: string; fields: string[] }[] = [
  { id: 'demo-at-1', name: 'User Endpoints', fields: ['model', 'os_version', 'last_seen'] },
  { id: 'demo-at-2', name: 'Virtual & On-Prem Servers', fields: ['os', 'hostname', 'cpu_count'] },
  { id: 'demo-at-3', name: 'Cloud Services & SaaS', fields: ['provider', 'region', 'account_id'] },
];

export const SEED_ASSET_CUSTOM_FIELDS: any[] = [];

// ─── Org settings ─────────────────────────────────────────────────────────────
export const SEED_ORG_SETTINGS = {
  policy_refresh_months: 12,
  needed_framework: ['ISO 27001:2022', 'SOC 2 Type II', 'GDPR', 'NIST CSF 2.0'],
};

export const SEED_AVAILABLE_FRAMEWORKS = [
  'ISO 27001:2022', 'SOC 2 Type II', 'SOC 2 Type I', 'GDPR', 'CCPA', 'HIPAA',
  'PCI DSS 4.0', 'NIST CSF 2.0', 'ISO 22301', 'ISO 27701', 'CIS Controls v8', 'CSA STAR',
];

// ─── Compliance tags (for /api/controls/compliance-tags) ──────────────────────
export const SEED_COMPLIANCE_TAGS = ['ISO 27001', 'SOC 2', 'GDPR', 'NIST CSF', 'PCI DSS', 'ISO 22301', 'HIPAA'];

// ─── Org members (for /api/org/users) ─────────────────────────────────────────
export const SEED_ORG_USERS = contactDefs.slice(0, 8).map((c, i) => ({
  id: i + 1,
  user_id: i === 0 ? DEMO_USER_ID : `demo-user-${i}`,
  email: c.email,
  name: c.name,
  role: i === 0 ? 'tenant_admin' : (i < 3 ? 'admin' : 'user'),
  status: 'active',
  created_at: ts(-365 + i * 10),
}));

// ─── Org "me" response for /api/org/me when in demo ───────────────────────────
export const SEED_ORG_ME = {
  userId: DEMO_USER_ID,
  orgId: DEMO_ORG_ID,
  orgName: 'ABC News',
  role: 'tenant_admin',
  email: 'demo@abcnews.example',
  isOnboarded: true,
  onboardingStatus: 'active' as const,
  neededFramework: SEED_ORG_SETTINGS.needed_framework,
};
