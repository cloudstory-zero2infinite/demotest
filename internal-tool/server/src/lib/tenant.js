// Tenant classification for Platform Analytics.
//
// There is no column in the DB marking a tenant as a consultant vs an
// organisation. The only signal today is the name (orgs are literally named
// "Consultant1".."Consultant29" vs "ABC News", "Cloudstory", etc.), so we
// classify by name prefix. This is the ONE place to change if a real
// `organizations.org_type` column is ever introduced.

const CONSULTANT_RE = /^\s*consultant/i;

export function classifyTenant(name) {
  return CONSULTANT_RE.test(name || '') ? 'consultant' : 'organisation';
}
