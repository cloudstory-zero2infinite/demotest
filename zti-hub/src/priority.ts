// Vulnerability prioritization — deliberately simple and pluggable. Today the
// priority is a function of the CVSS base score and KEV (CISA Known Exploited
// Vulnerabilities) membership: a CVE in KEV is always treated as Critical because
// it is being actively exploited in the wild. Expand later (e.g. EPSS, asset
// criticality, exposure) by enriching `prioritize()`.

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

export function severityFromCvss(cvss: number | null | undefined): Severity {
  if (cvss == null) return 'Info';
  if (cvss >= 9.0) return 'Critical';
  if (cvss >= 7.0) return 'High';
  if (cvss >= 4.0) return 'Medium';
  if (cvss > 0) return 'Low';
  return 'Info';
}

// Returns { severity, priority }. KEV membership escalates priority by one band
// (and forces at least P2), reflecting active exploitation.
export function prioritize(
  cvss: number | null | undefined,
  inKev = false
): { severity: Severity; priority: Priority } {
  const severity = severityFromCvss(cvss);
  let priority: Priority =
    severity === 'Critical' ? 'P1' :
    severity === 'High' ? 'P2' :
    severity === 'Medium' ? 'P3' : 'P4';

  if (inKev) {
    const bumped: Record<Priority, Priority> = { P1: 'P1', P2: 'P1', P3: 'P2', P4: 'P2' };
    priority = bumped[priority];
  }
  return { severity, priority };
}
