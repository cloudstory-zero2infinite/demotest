import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { loadConfig, saveConfig } from './config.js';
import { ask } from './prompt.js';
import { HubApi } from './api.js';

// ANSI terminal colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

interface WazuhVulnRecord {
  agentId: string;
  agentName: string;
  osFull: string;
  osFamily: string;
  cve: string;
  severity: string;
  packageName: string;
}

export async function testWazuhConnection(
  managerUrl: string,
  username?: string,
  password?: string,
  verifyTls?: boolean
): Promise<string> {
  if (!managerUrl || !username || !password) {
    throw new Error('Incomplete Wazuh Manager configuration settings.');
  }

  return new Promise((resolve, reject) => {
    let baseUrl = managerUrl.trim().replace(/\/$/, '');
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }

    let urlObj: URL;
    try {
      urlObj = new URL(`${baseUrl}/security/user/authenticate?raw=true`);
    } catch (e: any) {
      return reject(new Error(`Invalid URL format: ${e.message}`));
    }

    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;
    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
      rejectUnauthorized: verifyTls,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          const trimmed = data.trim();
          if (trimmed.startsWith('{')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.data && parsed.data.token) {
                return resolve(parsed.data.token);
              }
            } catch {
              // fall through to raw string
            }
          }
          resolve(trimmed);
        } else {
          let errorMsg = `Status ${res.statusCode}`;
          try {
            const parsed = JSON.parse(data);
            if (parsed.message) errorMsg += `: ${parsed.message}`;
          } catch {
            if (data) errorMsg += `: ${data.substring(0, 100)}`;
          }
          reject(new Error(errorMsg));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Connection timed out after 8s'));
    });

    req.end();
  });
}

function fetchWazuhAgents(managerUrl: string, token: string, verifyTls: boolean): Promise<any[]> {
  return new Promise((resolve, reject) => {
    let baseUrl = managerUrl.trim().replace(/\/$/, '');
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }

    const urlObj = new URL(`${baseUrl}/agents?limit=1000`);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      rejectUnauthorized: verifyTls,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.data && Array.isArray(parsed.data.affected_items)) {
              resolve(parsed.data.affected_items);
            } else {
              resolve([]);
            }
          } catch {
            reject(new Error('Invalid agents JSON response'));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Agents request timed out'));
    });

    req.end();
  });
}

function fetchAgentVulnerabilities(
  managerUrl: string,
  agentId: string,
  token: string,
  verifyTls: boolean
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    let baseUrl = managerUrl.trim().replace(/\/$/, '');
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }

    const urlObj = new URL(`${baseUrl}/vulnerability/${agentId}?limit=1000`);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      rejectUnauthorized: verifyTls,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.data && Array.isArray(parsed.data.affected_items)) {
              resolve(parsed.data.affected_items);
            } else {
              resolve([]);
            }
          } catch {
            reject(new Error('Invalid vulnerabilities JSON response'));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Vulnerability request timed out'));
    });

    req.end();
  });
}

function fetchVulnerabilitiesFromIndexer(host: string, verifyTls: boolean): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(`https://${host}:9200/wazuh-states-vulnerabilities-*/_search?size=5000`);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;
    const auth = Buffer.from('admin:SecretPassword').toString('base64');

    const bodyData = JSON.stringify({
      query: {
        match_all: {},
      },
    });

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyData),
        'Accept': 'application/json',
      },
      rejectUnauthorized: verifyTls,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.hits && Array.isArray(parsed.hits.hits)) {
              resolve(parsed.hits.hits.map((h: any) => h._source));
            } else {
              resolve([]);
            }
          } catch {
            reject(new Error('Invalid Indexer search response'));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('Indexer request timed out'));
    });

    req.write(bodyData);
    req.end();
  });
}

export async function integrateWazuh(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('Not authenticated. Run `zti authenticate` first.');
    process.exitCode = 1;
    return;
  }

  console.log('\nConfigure Wazuh integration settings (stored locally in ~/.zti/config.json).');
  console.log('You can leave fields blank to keep existing values.\n');

  const managerUrl = await ask('Wazuh Manager URL (e.g. https://wazuh.example.com:55000)', cfg.wazuh?.managerUrl || '');
  const username = await ask('Wazuh API Username', cfg.wazuh?.username || '');
  const password = await ask('Wazuh API Password', cfg.wazuh?.password || '');
  const verifyTlsRaw = await ask('Verify TLS cert? (y/N)', cfg.wazuh?.verifyTls ? 'y' : 'n');
  const verifyTls = /^y(es)?$/i.test((verifyTlsRaw || '').trim());

  if (managerUrl && username && password) {
    console.log(`\nTesting connection to Wazuh Manager at ${managerUrl}...`);
    try {
      await testWazuhConnection(managerUrl, username, password, verifyTls);
      console.log(`${GREEN}✓ Connection established successfully.${RESET}`);
    } catch (err: any) {
      console.log(`${RED}✗ Connection failed: ${err.message || String(err)}${RESET}`);
      const proceed = await ask('Save configuration anyway? (y/N)', 'n');
      if (!/^y(es)?$/i.test(proceed.trim())) {
        console.log('Aborted integration settings update.');
        return;
      }
    }
  }

  cfg.wazuh = {
    managerUrl: managerUrl || undefined,
    username: username || undefined,
    password: password || undefined,
    verifyTls,
  };

  saveConfig(cfg);
  console.log(`\n${GREEN}✓ Wazuh integration saved.${RESET}`);
}

function printWazuhReport(records: WazuhVulnRecord[], managerUrl: string, modeLabel: string): void {
  // Aggregate statistics
  const severityCounts: Record<string, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
    Pending: 0,
  };

  const cveCounts: Record<string, number> = {};
  const osCounts: Record<string, number> = {};
  const agentCounts: Record<string, number> = {};
  const packageCounts: Record<string, number> = {};
  const familyCounts: Record<string, number> = {};

  for (const r of records) {
    // Severity aggregation
    const sev = r.severity.charAt(0).toUpperCase() + r.severity.slice(1).toLowerCase();
    if (sev in severityCounts) {
      severityCounts[sev]++;
    } else if (sev.includes('pending') || sev.includes('eval')) {
      severityCounts['Pending']++;
    } else {
      severityCounts['Medium']++; // default fallback
    }

    // Top 5 aggregations
    cveCounts[r.cve] = (cveCounts[r.cve] || 0) + 1;
    osCounts[r.osFull] = (osCounts[r.osFull] || 0) + 1;
    agentCounts[r.agentName] = (agentCounts[r.agentName] || 0) + 1;
    packageCounts[r.packageName] = (packageCounts[r.packageName] || 0) + 1;
    
    const family = r.osFamily || 'unknown';
    familyCounts[family] = (familyCounts[family] || 0) + 1;
  }

  const getTop5 = (counts: Record<string, number>) => {
    return Object.entries(counts)
      .filter(([name]) => name && name !== 'N/A' && name !== '-')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  };

  const topCVEs = getTop5(cveCounts);
  const topOS = getTop5(osCounts);
  const topAgents = getTop5(agentCounts);
  const topPackages = getTop5(packageCounts);

  console.log('\n' + BOLD + '═'.repeat(64) + RESET);
  console.log(`${BOLD}WAZUH VULNERABILITY INGESTION REPORT${RESET} ${DIM}(${modeLabel})${RESET}`);
  console.log(`${DIM}Manager URL:${RESET} ${managerUrl}`);
  console.log(`${DIM}Status:${RESET}      ${GREEN}Active Scan Data Ingested${RESET}`);
  console.log(BOLD + '═'.repeat(64) + RESET);

  console.log(`\n${BOLD}Severity Summary:${RESET}`);
  console.log(`  ${RED}${BOLD}Critical${RESET} - Severity:     ${severityCounts.Critical}`);
  console.log(`  ${YELLOW}${BOLD}High${RESET} - Severity:         ${severityCounts.High}`);
  console.log(`  ${CYAN}${BOLD}Medium${RESET} - Severity:       ${severityCounts.Medium}`);
  console.log(`  ${GREEN}Low${RESET} - Severity:          ${severityCounts.Low}`);
  console.log(`  ${DIM}Pending${RESET} - Evaluation:     ${severityCounts.Pending}`);

  console.log(`\n${BOLD}Top 5 Vulnerabilities:${RESET}`);
  if (topCVEs.length === 0) console.log('  None');
  topCVEs.forEach(([cve, count], idx) => {
    console.log(`  ${idx + 1}. ${cve} (Count: ${count})`);
  });

  console.log(`\n${BOLD}Top 5 OS:${RESET}`);
  if (topOS.length === 0) console.log('  None');
  topOS.forEach(([os, count], idx) => {
    console.log(`  ${idx + 1}. ${os} (Count: ${count})`);
  });

  console.log(`\n${BOLD}Top 5 Agents:${RESET}`);
  if (topAgents.length === 0) console.log('  None');
  topAgents.forEach(([agent, count], idx) => {
    console.log(`  ${idx + 1}. ${agent} (Count: ${count})`);
  });

  console.log(`\n${BOLD}Top 5 Packages:${RESET}`);
  if (topPackages.length === 0) console.log('  None');
  topPackages.forEach(([pkg, count], idx) => {
    console.log(`  ${idx + 1}. ${pkg} (Count: ${count})`);
  });

  console.log(`\n${BOLD}Most Vulnerable OS Families:${RESET}`);
  if (Object.keys(familyCounts).length === 0) console.log('  None');
  Object.entries(familyCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([family, count]) => {
      console.log(`  - ${family}: ${count}`);
    });
  console.log('');
}

export async function ingestWazuh(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('Not authenticated. Run `zti authenticate` first.');
    process.exitCode = 1;
    return;
  }

  const wazuh = cfg.wazuh || {};
  if (!wazuh.managerUrl || !wazuh.username || !wazuh.password) {
    console.error('Wazuh not configured. Run `zti integrate wazuh` first.');
    process.exitCode = 1;
    return;
  }

  const records: WazuhVulnRecord[] = [];
  const isMock = !!cfg.mock;

  if (isMock) {
    // Total count: 46 Critical + 104 High + 176 Medium + 7 Low + 3 Pending = 336
    const cves = ['CVE-2018-20250', 'CVE-2018-20251', 'CVE-2019-25677', 'CVE-2023-38831', 'CVE-2023-40477'];
    for (let i = 0; i < 5; i++) {
      records.push({
        agentId: '001',
        agentName: 'my-laptop',
        osFull: 'Microsoft Windows 11 Home Single Language 10.0.26200.8655',
        osFamily: 'windows',
        cve: cves[i],
        severity: 'High',
        packageName: i === 0 ? 'WinRAR 5.60 beta 3 (64-bit)' : 'Google Chrome',
      });
    }

    const addMockGroup = (count: number, severity: string, startIdx: number) => {
      for (let i = 0; i < count; i++) {
        let packageName = 'Google Chrome';
        const totalIdx = startIdx + i;
        if (totalIdx < 9) {
          packageName = 'WinRAR 5.60 beta 3 (64-bit)';
        } else if (totalIdx < 16) {
          packageName = 'Python 3.13.12 (64-bit)';
        } else if (totalIdx < 23) {
          packageName = 'pypdf';
        } else if (totalIdx < 28) {
          packageName = 'starlette';
        }

        records.push({
          agentId: '001',
          agentName: 'my-laptop',
          osFull: 'Microsoft Windows 11 Home Single Language 10.0.26200.8655',
          osFamily: 'windows',
          cve: `CVE-2026-${1000 + totalIdx}`,
          severity,
          packageName,
        });
      }
    };

    addMockGroup(46, 'Critical', 5);
    addMockGroup(99, 'High', 51);
    addMockGroup(176, 'Medium', 150);
    addMockGroup(7, 'Low', 326);
    addMockGroup(3, 'Pending', 333);
  } else {
    // Real Mode
    try {
      console.log(`Connecting to Wazuh Manager API at ${wazuh.managerUrl}...`);
      const token = await testWazuhConnection(wazuh.managerUrl, wazuh.username, wazuh.password, wazuh.verifyTls);
      
      console.log('Fetching active agents list...');
      const agents = await fetchWazuhAgents(wazuh.managerUrl, token, !!wazuh.verifyTls);
      console.log(`Found ${agents.length} agent(s).`);

      let legacyFailed = false;

      for (const agent of agents) {
        console.log(`Fetching vulnerabilities for agent ${agent.name} (${agent.id})...`);
        try {
          const vulns = await fetchAgentVulnerabilities(wazuh.managerUrl, agent.id, token, !!wazuh.verifyTls);
          for (const v of vulns) {
            records.push({
              agentId: agent.id,
              agentName: agent.name,
              osFull: agent.os ? `${agent.os.name || ''} ${agent.os.version || ''}`.trim() : 'Unknown OS',
              osFamily: agent.os && agent.os.name ? (agent.os.name.toLowerCase().includes('win') ? 'windows' : 'linux') : 'unknown',
              cve: v.cve || 'N/A',
              severity: v.severity || 'Medium',
              packageName: v.name || 'Unknown Package',
            });
          }
        } catch (err: any) {
          console.warn(`Manager API /vulnerability/${agent.id} failed: ${err.message || String(err)}`);
          legacyFailed = true;
          break;
        }
      }

      // Fallback if legacy Manager API failed or returns no data (due to being Wazuh >= 4.8.0)
      if (legacyFailed || (agents.length > 0 && records.length === 0)) {
        console.log('\nManager API /vulnerability endpoint is not available (Wazuh 4.8+).');
        console.log('Attempting fallback to query Wazuh Indexer on port 9200...');
        
        const managerHost = new URL(wazuh.managerUrl.startsWith('http') ? wazuh.managerUrl : `https://${wazuh.managerUrl}`).hostname;
        
        try {
          const hits = await fetchVulnerabilitiesFromIndexer(managerHost, !!wazuh.verifyTls);
          console.log(`Successfully fetched ${hits.length} records from Wazuh Indexer.`);
          for (const hit of hits) {
            const agentId = hit.agent?.id || 'unknown';
            const agentName = hit.agent?.name || 'unknown';
            const osFull = hit.host?.os?.full || 'Unknown OS';
            const osFamily = osFull.toLowerCase().includes('win') ? 'windows' : 'linux';
            const cve = hit.vulnerability?.id || hit.vulnerability?.cve || 'N/A';
            const severity = hit.vulnerability?.severity || 'Medium';
            const packageName = hit.vulnerability?.package?.name || 'Unknown Package';

            records.push({
              agentId,
              agentName,
              osFull,
              osFamily,
              cve,
              severity,
              packageName,
            });
          }
        } catch (idxErr: any) {
          console.error(`${RED}✗ Indexer query failed: ${idxErr.message || String(idxErr)}${RESET}`);
          console.log(`Please make sure your Wazuh Indexer is running on port 9200 of ${managerHost} and accepts credentials admin:SecretPassword.`);
          console.log('Alternatively, run `zti config --mock` to use mock data for testing.');
          process.exitCode = 1;
          return;
        }
      }
    } catch (err: any) {
      console.error(`\n${RED}✗ Failed to ingest Wazuh findings: ${err.message || String(err)}${RESET}`);
      process.exitCode = 1;
      return;
    }
  }

  if (records.length === 0) {
    console.log('\n⚠ No vulnerabilities found on any active agents.');
    return;
  }

  // Print CLI Report
  printWazuhReport(records, wazuh.managerUrl, isMock ? 'mock' : 'real');

  // Push results to the ZTI Workspace database
  const mapSeverity = (sev: string): string => {
    const s = (sev || '').toLowerCase();
    if (s.includes('critical')) return 'Critical';
    if (s.includes('high')) return 'High';
    if (s.includes('medium')) return 'Medium';
    if (s.includes('low')) return 'Low';
    return 'Info';
  };

  const mapCvss = (sev: string): number => {
    const s = (sev || '').toLowerCase();
    if (s.includes('critical')) return 9.5;
    if (s.includes('high')) return 8.5;
    if (s.includes('medium')) return 5.5;
    if (s.includes('low')) return 2.5;
    return 0.0;
  };

  const findings = records.map((r) => ({
    host: r.agentName,
    port: 'N/A',
    cve_id: r.cve,
    vuln_name: `[${r.packageName}] ${r.cve}`,
    description: `Vulnerability ${r.cve} in package ${r.packageName} detected on agent ${r.agentName} (${r.osFull}).`,
    cvss_score: mapCvss(r.severity),
    severity: mapSeverity(r.severity),
    priority: null,
    in_kev: false,
    raw: r,
  }));

  const api = new HubApi(cfg);
  let jobId: string;
  try {
    const job = await api.createScanJob({
      target_type: 'all',
      target_value: null,
      authorized: true,
      consent_by: cfg.deviceName || 'cli',
      is_mock: isMock,
      scanner: 'wazuh',
    });
    jobId = job.id;
    console.log(`Created scan job ${jobId} in ZTI workspace.`);
  } catch (err: any) {
    console.error(`\n✗ Failed to create scan job in ZTI workspace: ${err.message || String(err)}`);
    process.exitCode = 1;
    return;
  }

  const summary = {
    total: findings.length,
    critical: findings.filter(f => f.severity === 'Critical').length,
    high: findings.filter(f => f.severity === 'High').length,
    medium: findings.filter(f => f.severity === 'Medium').length,
    low: findings.filter(f => f.severity === 'Low').length,
    info: findings.filter(f => f.severity === 'Info').length,
    kev: 0,
  };

  try {
    await api.postScanStatus(jobId, 'completed', summary);
    if (findings.length > 0) {
      const staged = await api.postScanFindings(jobId, findings);
      console.log(`✓ Successfully staged ${staged.staged} finding(s) to ZTI workspace.`);
    }
  } catch (err: any) {
    console.error(`✗ Failed to sync findings to ZTI workspace: ${err.message || String(err)}`);
  }
}
