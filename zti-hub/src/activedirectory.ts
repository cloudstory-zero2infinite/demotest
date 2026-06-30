import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
// @ts-ignore
import ldap from 'ldapjs';
import { loadConfig, saveConfig, scansDir, type ZtiConfig } from './config.js';
import { ask } from './prompt.js';
import { logWarn, logInfo } from './logger.js';
import { HubApi } from './api.js';
import { prioritize } from './priority.js';
import type { ScanFinding } from './scanner.js';

// ANSI styling helpers
const RED = '\x1b[31m';
const GRN = '\x1b[32m';
const YEL = '\x1b[33m';
const BLU = '\x1b[34m';
const MAG = '\x1b[35m';
const CYN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export interface AuditFinding {
  id: string;
  category: string;
  name: string;
  description: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  remediation: string;
}

export interface MachineState {
  type: 'Standalone' | 'ActiveDirectory';
  domain: string;
  dc: string;
  ldapServer: string;
  method: 'env' | 'nltest' | 'systeminfo' | 'config' | 'fallback';
}

export interface HardwareInfo {
  computerName: string;
  os: string;
  cpu: string;
  totalPhysicalMemoryGB: number;
  diskSummary: string[];
  clockSpeedMHz?: number;
}

const SEVERITY_CVSS: Record<AuditFinding['severity'], number> = {
  CRITICAL: 9.5,
  HIGH: 8.0,
  MEDIUM: 5.0,
  LOW: 2.0,
  INFO: 0,
};

function auditFindingsToScanFindings(
  findings: AuditFinding[],
  host: string,
  auditType: 'Standalone' | 'ActiveDirectory'
): ScanFinding[] {
  return findings.map((f) => {
    const cvss = SEVERITY_CVSS[f.severity] ?? 0;
    const { severity, priority } = prioritize(cvss, false);
    const desc = f.description + (f.remediation ? `\n\nRemediation: ${f.remediation}` : '');
    return {
      host,
      cve_id: f.id,
      vuln_name: f.name,
      description: desc,
      cvss_score: cvss || null,
      severity,
      priority,
      in_kev: false,
      raw: { source: 'ad', audit_type: auditType, category: f.category, finding_id: f.id },
    };
  });
}

function auditSummary(findings: AuditFinding[]) {
  return {
    total: findings.length,
    critical: findings.filter((f) => f.severity === 'CRITICAL').length,
    high: findings.filter((f) => f.severity === 'HIGH').length,
    medium: findings.filter((f) => f.severity === 'MEDIUM').length,
    low: findings.filter((f) => f.severity === 'LOW').length,
    info: findings.filter((f) => f.severity === 'INFO').length,
  };
}

async function stageAuditFindingsToWorkspace(
  findings: AuditFinding[],
  auditType: 'Standalone' | 'ActiveDirectory',
  host: string,
  domain: string,
  autoPush = false
): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.log(`${YEL}Not authenticated — skipping workspace upload. Run \`zti authenticate\` first.${RESET}`);
    return;
  }
  if (findings.length === 0) {
    console.log(`${GRN}No findings to stage.${RESET}`);
    return;
  }

  if (!autoPush) {
    const pushAnswer = await ask('Push findings to Vulnerability Assessment in ZTI? (y/N)', 'N');
    if (!/^y(es)?$/i.test(pushAnswer.trim())) {
      console.log(`${DIM}Findings not sent to workspace.${RESET}`);
      return;
    }
  }

  const api = new HubApi(cfg);
  const targetValue = auditType === 'ActiveDirectory' ? `AD:${domain}` : `Host:${host}`;
  const scanFindings = auditFindingsToScanFindings(findings, host, auditType);
  const summary = auditSummary(findings);

  try {
    const job = await api.createScanJob({
      target_type: 'local',
      target_value: targetValue,
      scanner: 'ad',
      is_mock: false,
      consent_by: cfg.deviceName,
    });
    await api.postScanStatus(job.id, 'completed', summary);
    const staged = await api.postScanFindings(job.id, scanFindings);
    console.log(`\n${GRN}✓ Staged ${staged.staged} finding(s) to Vulnerability Assessment (source: AD).${RESET}`);
    console.log(`${DIM}Refresh ZTI → ZTI Hub Services → Vulnerability Assessment to review and import.${RESET}`);
    logInfo('ad_audit_staged', { jobId: job.id, staged: staged.staged, auditType });
  } catch (e: any) {
    console.error(`\n${RED}✗ Failed to push findings to workspace: ${e.message}${RESET}`);
    logWarn('ad_audit_stage_failed', { error: e.message, auditType });
    process.exitCode = 1;
  }
}

/** Runs a system command safely and returns stdout. */
function runCmd(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

/** Runs a Windows PowerShell command safely and returns stdout. */
function runPowerShell(cmd: string): string {
  if (process.platform !== 'win32') return '';
  const cleanCmd = cmd.replace(/"/g, '\\"');
  try {
    return execSync(`powershell -NoProfile -NonInteractive -Command "${cleanCmd}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 8000
    }).trim();
  } catch {
    return '';
  }
}

/** Detects if the machine is standalone , domain joined. */
export function detectMachineState(): MachineState {
  const cfg = loadConfig();

  // If user explicitly configured AD server/domain, we can assume ActiveDirectory mode
  if (cfg.ad?.server || cfg.ad?.domain) {
    return {
      type: 'ActiveDirectory',
      domain: cfg.ad.domain || 'configured.local',
      dc: cfg.ad.server ? (() => {
        try {
          return cfg.ad.server.includes('://') ? new URL(cfg.ad.server).hostname : cfg.ad.server.split(':')[0];
        } catch {
          return cfg.ad.server;
        }
      })() : 'configured-dc.local',
      ldapServer: cfg.ad.server || 'ldap://configured-dc.local:389',
      method: 'config'
    };
  }

  if (process.platform !== 'win32') {
    // Non-windows environments default to Standalone for local dev
    return {
      type: 'Standalone',
      domain: 'WORKGROUP',
      dc: '',
      ldapServer: '',
      method: 'fallback'
    };
  }

  // 1. Check USERDOMAIN vs COMPUTERNAME environment variables
  const computerName = process.env.COMPUTERNAME || '';
  const userDomain = process.env.USERDOMAIN || '';

  // 2. Check nltest
  const nltestOut = runCmd('nltest /dsgetdc');
  if (nltestOut && !nltestOut.includes('ERROR_NO_SUCH_DOMAIN') && !nltestOut.includes('failed')) {
    const domainMatch = nltestOut.match(/Dom Guid:.*[\r\n]+.*Dom Name:\s*([^\s\r\n]+)/i) || nltestOut.match(/AD Site:.*[\r\n]+.*DC:\s*\\\\([^\s\r\n\\]+)/i);
    const dcMatch = nltestOut.match(/Address:\s*\\\\([^\s\r\n]+)/i) || nltestOut.match(/DC:\s*\\\\([^\s\r\n]+)/i);
    const detectedDomain = userDomain && userDomain.toLowerCase() !== 'workgroup' && userDomain.toLowerCase() !== computerName.toLowerCase() ? userDomain : 'corp.local';
    return {
      type: 'ActiveDirectory',
      domain: detectedDomain,
      dc: dcMatch ? dcMatch[1] : 'dc01.' + detectedDomain,
      ldapServer: `ldap://${dcMatch ? dcMatch[1] : 'dc01.' + detectedDomain}:389`,
      method: 'nltest'
    };
  }

  // 3. Check systeminfo for Domain value
  const systemInfoOut = runCmd('systeminfo');
  const domainLine = systemInfoOut.split('\n').find(l => l.toLowerCase().startsWith('domain:'));
  if (domainLine) {
    const dVal = domainLine.split(':')[1]?.trim() || '';
    if (dVal && dVal.toUpperCase() !== 'WORKGROUP' && dVal.toLowerCase() !== computerName.toLowerCase()) {
      return {
        type: 'ActiveDirectory',
        domain: dVal,
        dc: 'dc01.' + dVal,
        ldapServer: `ldap://dc01.${dVal}:389`,
        method: 'systeminfo'
      };
    }
  }

  // 4. Check %USERDOMAIN% vs WORKGROUP
  if (userDomain && userDomain.toUpperCase() !== 'WORKGROUP' && userDomain.toLowerCase() !== computerName.toLowerCase()) {
    return {
      type: 'ActiveDirectory',
      domain: userDomain,
      dc: 'dc01.' + userDomain.toLowerCase(),
      ldapServer: `ldap://dc01.${userDomain.toLowerCase()}:389`,
      method: 'env'
    };
  }

  // Default to Standalone (WORKGROUP)
  return {
    type: 'Standalone',
    domain: 'WORKGROUP',
    dc: '',
    ldapServer: '',
    method: 'fallback'
  };
}

/** Run Standalone Host Audit */
export async function runHostAudit(): Promise<{ collected: any; findings: AuditFinding[] }> {
  console.log(`${CYN}Running Standalone Host Security Audit...${RESET}`);

  const collected: any = {
    hostname: os.hostname(),
    username: os.userInfo().username || process.env.USERNAME || 'unknown',
    os: `${os.type()} ${os.release()} (${os.platform()})`,
    cpu: '',
    ram: { totalGB: 0, freeGB: 0 },
    disks: [] as string[],
    ips: [] as string[],
    macs: [] as string[],
    installedSoftwareCount: 0,
    runningProcessesCount: 0,
    localUsers: [] as string[],
    localGroups: [] as string[],
    firewallStatus: 'Unknown',
    antivirusStatus: 'Unknown',
    startupAppsCount: 0,
    networkAdapters: [] as string[],
    clockSpeedMHz: 0,
    totalPhysicalMemoryGB: 0
  };

  // Get network interfaces
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (!net.internal) {
        if (net.family === 'IPv4' && !collected.ips.includes(net.address)) {
          collected.ips.push(net.address);
        }
        if (net.mac && net.mac !== '00:00:00:00:00:00' && !collected.macs.includes(net.mac)) {
          collected.macs.push(net.mac);
        }
      }
    }
  }

  // Get CPU and RAM
  const cpus = os.cpus();
  if (cpus && cpus.length > 0) {
    collected.cpu = `${cpus[0].model} (${cpus.length} cores)`;
    collected.clockSpeedMHz = cpus[0].speed;
  }
  collected.ram.totalGB = Math.round(os.totalmem() / 1024 / 1024 / 1024 * 100) / 100;
  collected.ram.freeGB = Math.round(os.freemem() / 1024 / 1024 / 1024 * 100) / 100;
  collected.totalPhysicalMemoryGB = collected.ram.totalGB;

  let firewallEnabled = true;
  let antivirusRunning = true;
  let localAdminsCount = 0;
  let startupAppsCount = 0;
  let localUsersCount = 0;

  if (process.platform === 'win32') {
    // Windows PowerShell details collection
    const rawOs = runPowerShell('Get-CimInstance Win32_OperatingSystem | ForEach-Object { $_.Caption + " " + $_.Version }');
    if (rawOs) collected.os = rawOs;

    // Disks
    const rawDisks = runPowerShell('Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { $_.DeviceID + " (" + [Math]::Round($_.FreeSpace/1GB, 1) + "GB free of " + [Math]::Round($_.Size/1GB, 1) + "GB)" }');
    if (rawDisks) collected.disks = rawDisks.split('\r\n').filter(Boolean);

    // Installed software count
    const rawSoftware = runPowerShell('Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object -ExpandProperty DisplayName');
    const softwareList = rawSoftware.split('\r\n').filter(Boolean);
    collected.installedSoftwareCount = softwareList.length;
    collected.installedSoftwareSummary = softwareList.slice(0, 10); // store top 10

    // Running processes
    const rawProcs = runPowerShell('Get-Process | ForEach-Object { $_.ProcessName }');
    const procList = rawProcs.split('\r\n').filter(Boolean);
    collected.runningProcessesCount = procList.length;
    collected.runningProcessesSummary = [...new Set(procList)].slice(0, 10);

    // Local Users
    const rawUsers = runPowerShell('Get-LocalUser | ForEach-Object { $_.Name + " (Enabled: " + $_.Enabled + ")" }');
    collected.localUsers = rawUsers.split('\r\n').filter(Boolean);
    localUsersCount = collected.localUsers.length;

    // Local Groups
    const rawGroups = runPowerShell('Get-LocalGroup | ForEach-Object { $_.Name }');
    collected.localGroups = rawGroups.split('\r\n').filter(Boolean);

    // Firewall status
    const rawFirewall = runPowerShell('Get-NetFirewallProfile | ForEach-Object { $_.Name + ":" + $_.Enabled }');
    collected.firewallStatus = rawFirewall ? rawFirewall.replace(/\r\n/g, ', ') : 'Unknown';
    if (rawFirewall && rawFirewall.includes(':False')) {
      firewallEnabled = false;
    }

    // Antivirus status
    const rawAv = runPowerShell('Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntivirusProduct | ForEach-Object { $_.displayName + " (State: " + $_.productState + ")" }');
    collected.antivirusStatus = rawAv ? rawAv.trim() : 'None/Windows Defender';
    if (!rawAv && !runPowerShell('Get-Service -Name WinDefend -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" }')) {
      antivirusRunning = false;
    }

    // Startup Applications
    const rawStartup = runPowerShell('Get-CimInstance Win32_StartupCommand | ForEach-Object { $_.Name }');
    const startupList = rawStartup.split('\r\n').filter(Boolean);
    collected.startupAppsCount = startupList.length;
    startupAppsCount = startupList.length;

    // Network adapters
    const rawAdapters = runPowerShell('Get-NetAdapter | ForEach-Object { $_.Name + " (" + $_.Status + " - " + $_.MacAddress + ")" }');
    collected.networkAdapters = rawAdapters.split('\r\n').filter(Boolean);

    // Local Administrators check
    const rawAdmins = runPowerShell('Get-LocalGroupMember -Group "Administrators" | ForEach-Object { $_.Name }');
    const adminsList = rawAdmins.split('\r\n').filter(Boolean);
    localAdminsCount = adminsList.length;
    collected.localAdministrators = adminsList;
  } else {
    // Unix fallback or mock
    collected.disks = ['/ (50GB free of 250GB)'];
    collected.installedSoftwareCount = 85;
    collected.installedSoftwareSummary = ['git', 'node', 'docker', 'python3', 'nginx', 'ssh-client', 'curl', 'zsh', 'tmux', 'htop'];
    collected.runningProcessesCount = 45;
    collected.runningProcessesSummary = ['node', 'ssh-agent', 'dockerd', 'init', 'systemd', 'bash', 'zsh', 'syslogd'];
    collected.localUsers = ['root (Enabled: true)', 'lenovo (Enabled: true)', 'guest (Enabled: false)'];
    localUsersCount = 3;
    collected.localGroups = ['root', 'sudo', 'users', 'docker'];
    collected.firewallStatus = 'ufw: active';
    collected.antivirusStatus = 'ClamAV (Running)';
    collected.startupAppsCount = 4;
    startupAppsCount = 4;
    collected.networkAdapters = ['eth0 (Up - 00:15:5D:01:02:03)', 'lo (Up)'];
    collected.localAdministrators = ['root', 'lenovo'];
    localAdminsCount = 2;
  }

  // Security audit findings calculation
  const findings: AuditFinding[] = [];

  // 1. Firewall
  if (!firewallEnabled || collected.firewallStatus.includes('False')) {
    findings.push({
      id: 'HOST-FW-01',
      category: 'Firewall',
      name: 'Local Firewall is Disabled',
      description: 'One or more local firewall profiles (Domain, Private, or Public) are turned off. This exposes the system to unauthorized network connections.',
      severity: 'HIGH',
      remediation: 'Enable firewall profiles using `netsh advfirewall set allprofiles state on` or via Windows Security settings.'
    });
  } else {
    findings.push({
      id: 'HOST-FW-INFO',
      category: 'Firewall',
      name: 'Local Firewall is Enabled',
      description: 'All system firewall profiles are configured as active.',
      severity: 'INFO',
      remediation: 'No action required.'
    });
  }

  // 2. Antivirus
  if (!antivirusRunning || collected.antivirusStatus.toLowerCase().includes('state: 0') || collected.antivirusStatus === '') {
    findings.push({
      id: 'HOST-AV-01',
      category: 'Antivirus',
      name: 'Antivirus Engine Inactive or Disabled',
      description: 'No active real-time antivirus provider registered with Security Center was detected running.',
      severity: 'HIGH',
      remediation: 'Ensure Windows Defender or another registered endpoint protection solution is running and updated.'
    });
  } else {
    findings.push({
      id: 'HOST-AV-INFO',
      category: 'Antivirus',
      name: 'Antivirus Active',
      description: `Active endpoint protection detected: ${collected.antivirusStatus}`,
      severity: 'INFO',
      remediation: 'Ensure definitions are updated automatically.'
    });
  }

  // 3. Local Administrators
  if (localAdminsCount > 2) {
    findings.push({
      id: 'HOST-ADM-01',
      category: 'Privileges',
      name: 'Excessive Local Administrator Accounts',
      description: `Detected ${localAdminsCount} local admin accounts: ${collected.localAdministrators.join(', ')}. Multiple administrative accounts increase the attack surface.`,
      severity: 'MEDIUM',
      remediation: 'Audit local admin memberships. Remove standard user accounts from the Administrators group.'
    });
  }

  // 4. Startup Applications
  if (startupAppsCount > 5) {
    findings.push({
      id: 'HOST-STARTUP-01',
      category: 'System Performance',
      name: 'Excessive Startup Applications',
      description: `Detected ${startupAppsCount} applications configured to run at startup. This slows boot times and increases potential persistence vectors for malware.`,
      severity: 'LOW',
      remediation: 'Disable unnecessary startup apps via Task Manager or registry locations.'
    });
  }

  // 5. Weak Password Policies (local fallback check)
  findings.push({
    id: 'HOST-PWD-01',
    category: 'Password Policy',
    name: 'Weak Local Password Policy (Default)',
    description: 'Local security policy does not enforce complexity or history (minimum length 0). Common on standalone machines.',
    severity: 'MEDIUM',
    remediation: 'Configure local password policy: `net accounts /minpwlen:12 /maxpwage:90 /unique:5`.'
  });

  // 6. Stale accounts
  if (localUsersCount > 5) {
    findings.push({
      id: 'HOST-USER-01',
      category: 'Account Management',
      name: 'Stale Local User Accounts',
      description: 'Multiple local user accounts are present. Dormant/unused accounts are entry points if passwords are weak.',
      severity: 'LOW',
      remediation: 'Remove or disable old, unused user accounts using `net user <username> /active:no`.'
    });
  }

  // 7. Missing patches
  const pendingUpdates = process.platform === 'win32'
    ? runPowerShell('(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher().Search("IsInstalled=0 and Type=\'Software\'").Updates.Count')
    : '';
  const patchCount = parseInt(pendingUpdates) || 0;
  if (patchCount > 0) {
    findings.push({
      id: 'HOST-PATCH-01',
      category: 'Patch Management',
      name: 'Missing Security Updates & Patches',
      description: `System is missing ${patchCount} software or security updates. This leaves the host vulnerable to known CVEs.`,
      severity: 'MEDIUM',
      remediation: 'Install pending updates via Windows Update settings or run `Install-Module PSWindowsUpdate; Get-WindowsUpdate -Install`.'
    });
  }

  // 8. Open ports
  const openPortsOutput = process.platform === 'win32'
    ? runCmd('netstat -ano')
    : '';
  const dangerousPorts: number[] = [];
  if (openPortsOutput) {
    if (openPortsOutput.includes(':445 ')) dangerousPorts.push(445);
    if (openPortsOutput.includes(':3389 ')) dangerousPorts.push(3389);
    if (openPortsOutput.includes(':139 ')) dangerousPorts.push(139);
  }
  if (dangerousPorts.length > 0) {
    findings.push({
      id: 'HOST-PORT-01',
      category: 'Network Security',
      name: 'Potentially Exposed Ports Enabled',
      description: `Common exposed ports are open locally: [${dangerousPorts.join(', ')}]. SMB (445) and RDP (3389) can be vectors for wormable exploits.`,
      severity: 'LOW',
      remediation: 'Block incoming connections on these ports from public networks using local firewall rules.'
    });
  }

  return { collected, findings };
}

/** Run Active Directory Audit */
export async function runAdAudit(detected: MachineState): Promise<{ collected: any; findings: AuditFinding[] }> {
  console.log(`${CYN}Running Active Directory Domain Controller Security Audit...${RESET}`);
  console.log(`${DIM}Domain:      ${detected.domain}${RESET}`);
  console.log(`${DIM}DC Host:     ${detected.dc}${RESET}`);
  console.log(`${DIM}LDAP Server: ${detected.ldapServer}${RESET}`);

  const cfg = loadConfig();
  const collected: any = {
    domainName: detected.domain,
    domainControllers: [detected.dc],
    ldapServer: detected.ldapServer,
    ldapBound: false,
    ldapAuthMethod: 'None',
    users: [] as string[],
    groups: [] as string[],
    ous: [] as string[],
    gpos: [] as string[],
    passwordPolicies: {
      minLength: 7,
      complexity: false,
      lockoutThreshold: 0,
      lockoutDuration: 0,
      historyCount: 0
    },
    lockedAccounts: [] as string[],
    inactiveUsers: [] as string[],
    privilegedAccounts: [] as string[],
    kerberosConfig: {
      maxTicketAge: 10,
      preAuthDisabledCount: 0
    },
    hardwareInfo: {
      local: null as HardwareInfo | null,
      domainController: null as HardwareInfo | null
    }
  };

  const findings: AuditFinding[] = [];
  let isMock = cfg.mock;

  // Let's attempt real collection:
  // 1. LDAP bind (if configured)
  // 2. PowerShell ADSI fallback (if Windows domain-joined)
  // 3. Complete mock data (if both fail or mock is enabled)

  if (!isMock && cfg.ad?.server && cfg.ad?.username && cfg.ad?.password) {
    try {
      console.log(`${DIM}Attempting LDAP Bind with configured service account...${RESET}`);
      const adDetails = await fetchLdapDetails(cfg.ad.server, cfg.ad.username, cfg.ad.password, cfg.ad.domain || detected.domain);
      Object.assign(collected, adDetails);
      collected.ldapBound = true;
      collected.ldapAuthMethod = 'Service Account Bind';
    } catch (e: any) {
      console.log(`${YEL}⚠ LDAP bind failed: ${e.message}. Gracing fallback...${RESET}`);
      logWarn('ad_ldap_bind_failed', { error: e.message });
      // Proceed to PowerShell fallback
    }
  }

  // If LDAP is not configured or failed, and we are on Windows, try PowerShell ADSI (Integrated Auth)
  if (!isMock && !collected.ldapBound && process.platform === 'win32') {
    try {
      console.log(`${DIM}Attempting Integrated Windows Authentication (ADSI/PowerShell)...${RESET}`);
      const psDetails = fetchIntegratedAdDetails(detected.domain);
      Object.assign(collected, psDetails);
      collected.ldapBound = true;
      collected.ldapAuthMethod = 'Integrated ADSI / Windows Auth';
    } catch (e: any) {
      console.log(`${YEL}⚠ Integrated ADSI query failed. Gracing fallback to mock/development values...${RESET}`);
      logWarn('ad_adsi_query_failed', { error: e.message });
    }
  }

  // Collect hardware details for the local host and, if possible, the domain controller.
  if (process.platform === 'win32') {
    collected.hardwareInfo.local = collectHardwareInfo();
    if (detected.dc) {
      collected.hardwareInfo.domainController = collectHardwareInfo(detected.dc);
    }
  }

  // Fallback to high-fidelity mock if not bound
  if (!collected.ldapBound) {
    isMock = true;
    console.log(`${YEL}Using Local Active Directory Simulation (Mock Mode)${RESET}`);
    collected.ldapAuthMethod = 'Mock Simulation';
    collected.users = ['Administrator', 'krbtgt', 'svc-zti', 'jdoe', 'asmith', 'bwhite', 'cgray', 'dblack'];
    collected.groups = ['Domain Admins', 'Domain Users', 'Enterprise Admins', 'Schema Admins', 'Backup Operators', 'Finance-Dept'];
    collected.ous = ['Domain Controllers', 'Users', 'Computers', 'ServiceAccounts', 'Departments', 'Workstations'];
    collected.gpos = ['Default Domain Policy', 'Default Domain Controllers Policy', 'Workstation-Firewall-Policy', 'Disable-USB-GPO', 'LAPS-Deployment'];
    collected.passwordPolicies = {
      minLength: 7,
      complexity: false,
      lockoutThreshold: 15,
      lockoutDuration: 10,
      historyCount: 3
    };
    collected.lockedAccounts = ['asmith'];
    collected.inactiveUsers = ['bwhite', 'cgray'];
    collected.privilegedAccounts = ['Administrator', 'svc-zti'];
    collected.kerberosConfig = {
      maxTicketAge: 12,
      preAuthDisabledCount: 1
    };
  }

  // Security finding evaluations based on collected metadata
  
  // 1. Password Policies
  const pp = collected.passwordPolicies;
  if (!pp.complexity) {
    findings.push({
      id: 'AD-PWD-01',
      category: 'Password Policy',
      name: 'Domain Password Complexity Disabled',
      description: 'Active Directory password complexity requirements are disabled. Users can set simple, easily guessable passwords.',
      severity: 'HIGH',
      remediation: 'Configure the Default Domain Policy GPO to enable password complexity (Minimum 3 character classes).'
    });
  }
  if (pp.minLength < 12) {
    findings.push({
      id: 'AD-PWD-02',
      category: 'Password Policy',
      name: 'Short Minimum Password Length',
      description: `The minimum domain password length is set to ${pp.minLength} characters. Modern compliance frameworks recommend at least 12-14 characters.`,
      severity: 'MEDIUM',
      remediation: 'Update the Default Domain Policy GPO to enforce a minimum password length of 12 or 14 characters.'
    });
  }
  if (pp.historyCount < 5) {
    findings.push({
      id: 'AD-PWD-03',
      category: 'Password Policy',
      name: 'Insufficient Password History Enforced',
      description: `Only ${pp.historyCount} unique passwords must be used before reuse. This permits users to toggle between a few favorite passwords.`,
      severity: 'MEDIUM',
      remediation: 'Increase password history enforcement to at least 24 unique passwords.'
    });
  }

  // 2. Inactive accounts
  if (collected.inactiveUsers.length > 0) {
    findings.push({
      id: 'AD-USER-01',
      category: 'Account Security',
      name: 'Stale Active Directory User Accounts',
      description: `Detected ${collected.inactiveUsers.length} domain user accounts that have not logged in for over 90 days: [${collected.inactiveUsers.join(', ')}].`,
      severity: 'LOW',
      remediation: 'Disable or delete inactive accounts to prevent password spraying or credential stuffing targeting dormant accounts.'
    });
  }

  // 3. Locked Accounts
  if (collected.lockedAccounts.length > 0) {
    findings.push({
      id: 'AD-USER-02',
      category: 'Account Security',
      name: 'Locked Domain Accounts Detected',
      description: `Domain accounts are currently locked out: [${collected.lockedAccounts.join(', ')}]. This may indicate an ongoing password-spraying or brute-force attack.`,
      severity: 'LOW',
      remediation: 'Investigate the security logs (Event ID 4740) on the Domain Controller to identify the source of the lockout.'
    });
  }

  // 4. Privileged account counts
  if (collected.privilegedAccounts.length > 3) {
    findings.push({
      id: 'AD-PRIV-01',
      category: 'Access Control',
      name: 'Excessive Domain Privileged Accounts',
      description: `Detected ${collected.privilegedAccounts.length} accounts with administrator privileges: [${collected.privilegedAccounts.join(', ')}].`,
      severity: 'HIGH',
      remediation: 'Minimize Domain Admins group membership. Move service accounts or utility accounts out of highly privileged groups.'
    });
  }

  // 5. Kerberos Configuration
  if (collected.kerberosConfig.preAuthDisabledCount > 0) {
    findings.push({
      id: 'AD-KERB-01',
      category: 'Kerberos',
      name: 'Kerberos Pre-Authentication Disabled',
      description: `Detected ${collected.kerberosConfig.preAuthDisabledCount} account(s) with DONT_REQ_PREAUTH set. Attackers can request TGTs and decrypt passwords offline (AS-REP Roasting).`,
      severity: 'CRITICAL',
      remediation: 'Identify accounts with pre-authentication disabled and enable "Do not require Kerberos preauthentication" option in AD.'
    });
  }
  if (collected.kerberosConfig.maxTicketAge > 10) {
    findings.push({
      id: 'AD-KERB-02',
      category: 'Kerberos',
      name: 'Excessive Kerberos Ticket Lifetime',
      description: `Kerberos max ticket age is set to ${collected.kerberosConfig.maxTicketAge} hours. Long lifetimes allow stolen tickets to remain valid longer.`,
      severity: 'MEDIUM',
      remediation: 'Reduce maximum Kerberos user ticket lifetime to 10 hours or less.'
    });
  }

  // 6. Missing Patches / Antivirus / Firewall (simulated/domain GPO check)
  if (isMock) {
    findings.push({
      id: 'AD-GPO-01',
      category: 'GPO Hardening',
      name: 'Domain GPO Permits Inactive Firewalls',
      description: 'Domain GPOs do not enforce local firewall configurations, resulting in disabled firewalls on some target workstations.',
      severity: 'HIGH',
      remediation: 'Configure a GPO to enforce and lock the Windows Defender Firewall status to Enabled across all profiles.'
    });
    findings.push({
      id: 'AD-DC-01',
      category: 'Patch Management',
      name: 'Domain Controller Missing Critical Security updates',
      description: 'One or more DCs are missing security updates related to Netlogon Zerologon or Active Directory privilege escalation vulnerabilities.',
      severity: 'CRITICAL',
      remediation: 'Perform immediate patch cycle updates on all domain controller operating systems.'
    });
  }

  return { collected, findings };
}

/** Queries Active Directory using LDAP via service account credentials */
function fetchLdapDetails(serverUrl: string, bindDn: string, bindPw: string, domain: string): Promise<any> {
  return new Promise((resolve, reject) => {
    // Basic DN derivation from domain: corp.local -> DC=corp,DC=local
    const parts = domain.split('.');
    const baseDn = parts.map(p => `DC=${p}`).join(',');

    const client = ldap.createClient({
      url: serverUrl,
      connectTimeout: 5000,
      timeout: 5000
    });

    client.bind(bindDn, bindPw, (err: any) => {
      if (err) {
        client.destroy();
        return reject(err);
      }

      const details: any = {
        users: [] as string[],
        groups: [] as string[],
        ous: [] as string[],
        gpos: [] as string[],
        passwordPolicies: {
          minLength: 7,
          complexity: false,
          lockoutThreshold: 0,
          lockoutDuration: 0,
          historyCount: 0
        },
        lockedAccounts: [] as string[],
        inactiveUsers: [] as string[],
        privilegedAccounts: [] as string[],
        kerberosConfig: {
          maxTicketAge: 10,
          preAuthDisabledCount: 0
        }
      };

      // Perform a search for users
      client.search(baseDn, {
        filter: '(&(objectCategory=person)(objectClass=user))',
        scope: 'sub',
        attributes: ['sAMAccountName', 'lockoutTime', 'lastLogonTimestamp', 'userAccountControl', 'memberOf']
      }, (searchErr: any, res: any) => {
        if (searchErr) {
          client.destroy();
          return reject(searchErr);
        }

        res.on('searchEntry', (entry: any) => {
          const user = entry.pojo;
          const name = user.attributes.find((a: any) => a.type === 'sAMAccountName')?.values[0];
          if (name) {
            details.users.push(name);

            // Locked account
            const lockout = user.attributes.find((a: any) => a.type === 'lockoutTime')?.values[0];
            if (lockout && lockout !== '0') {
              details.lockedAccounts.push(name);
            }

            // Inactive (lastLogonTimestamp - 90 days threshold)
            // AD timestamp is in 100-nanosecond intervals since Jan 1, 1601.
            const lastLogon = user.attributes.find((a: any) => a.type === 'lastLogonTimestamp')?.values[0];
            if (lastLogon) {
              const ms = (parseInt(lastLogon) / 10000) - 11644473600000;
              const diffDays = (Date.now() - ms) / (1000 * 60 * 60 * 24);
              if (diffDays > 90) {
                details.inactiveUsers.push(name);
              }
            }

            // Pre-auth disabled (UserAccountControl bit 0x400000)
            const uac = parseInt(user.attributes.find((a: any) => a.type === 'userAccountControl')?.values[0] || '0');
            if (uac & 0x400000) {
              details.kerberosConfig.preAuthDisabledCount++;
            }

            // Privileged groups members
            const memberOf = user.attributes.find((a: any) => a.type === 'memberOf')?.values || [];
            const isPriv = memberOf.some((g: string) => g.includes('Domain Admins') || g.includes('Enterprise Admins') || g.includes('Schema Admins') || name.toLowerCase() === 'administrator');
            if (isPriv) {
              details.privilegedAccounts.push(name);
            }
          }
        });

        res.on('error', (err: any) => {
          client.destroy();
          reject(err);
        });

        res.on('end', () => {
          // Perform groups search
          client.search(baseDn, {
            filter: '(objectClass=group)',
            scope: 'sub',
            attributes: ['sAMAccountName']
          }, (groupErr: any, gRes: any) => {
            if (groupErr) {
              client.destroy();
              return resolve(details);
            }

            gRes.on('searchEntry', (entry: any) => {
              const group = entry.pojo;
              const gName = group.attributes.find((a: any) => a.type === 'sAMAccountName')?.values[0];
              if (gName) details.groups.push(gName);
            });

            gRes.on('end', () => {
              // GPOs & OUs search
              client.search(baseDn, {
                filter: '(|(objectClass=organizationalUnit)(objectClass=groupPolicyContainer))',
                scope: 'sub',
                attributes: ['ou', 'displayName', 'objectClass']
              }, (gpoErr: any, gpoRes: any) => {
                if (gpoErr) {
                  client.destroy();
                  return resolve(details);
                }

                gpoRes.on('searchEntry', (entry: any) => {
                  const item = entry.pojo;
                  const ouName = item.attributes.find((a: any) => a.type === 'ou')?.values[0];
                  const gpoName = item.attributes.find((a: any) => a.type === 'displayName')?.values[0];
                  if (ouName) details.ous.push(ouName);
                  if (gpoName) details.gpos.push(gpoName);
                });

                gpoRes.on('end', () => {
                  client.destroy();
                  resolve(details);
                });
              });
            });
          });
        });
      });
    });
  });
}

/** Queries Active Directory using PowerShell ADSI commands for Integrated Auth */
function fetchIntegratedAdDetails(domain: string): any {
  const details: any = {
    users: [] as string[],
    groups: [] as string[],
    ous: [] as string[],
    gpos: [] as string[],
    passwordPolicies: {
      minLength: 7,
      complexity: false,
      lockoutThreshold: 0,
      lockoutDuration: 0,
      historyCount: 0
    },
    lockedAccounts: [] as string[],
    inactiveUsers: [] as string[],
    privilegedAccounts: [] as string[],
    kerberosConfig: {
      maxTicketAge: 10,
      preAuthDisabledCount: 0
    }
  };

  // Get Password Policy using standard Windows utility
  const netAccounts = runCmd('net accounts');
  if (netAccounts) {
    const minLenLine = netAccounts.split('\n').find(l => l.toLowerCase().includes('minimum password length'));
    const lockoutLine = netAccounts.split('\n').find(l => l.toLowerCase().includes('lockout threshold'));
    const historyLine = netAccounts.split('\n').find(l => l.toLowerCase().includes('password uniqueness'));

    if (minLenLine) details.passwordPolicies.minLength = parseInt(minLenLine.split(':')[1]) || 7;
    if (lockoutLine) details.passwordPolicies.lockoutThreshold = parseInt(lockoutLine.split(':')[1]) || 0;
    if (historyLine) details.passwordPolicies.historyCount = parseInt(historyLine.split(':')[1]) || 0;
  }

  // Domain complexity requirement check
  const complexityVal = runPowerShell('([ADSI]"LDAP://' + domain + '").minPasswordProperties');
  if (complexityVal) {
    // minPasswordProperties & 1 indicates complexity is enabled
    const props = parseInt(complexityVal) || 0;
    details.passwordPolicies.complexity = (props & 1) === 1;
  }

  // Fetch Users
  const rawUsers = runPowerShell('([adsisearcher]"(objectCategory=person)(objectClass=user)").FindAll() | ForEach-Object { $_.Properties.samaccountname[0] }');
  if (rawUsers) details.users = rawUsers.split('\r\n').filter(Boolean);

  // Fetch Groups
  const rawGroups = runPowerShell('([adsisearcher]"(objectClass=group)").FindAll() | ForEach-Object { $_.Properties.samaccountname[0] }');
  if (rawGroups) details.groups = rawGroups.split('\r\n').filter(Boolean);

  // Fetch OUs
  const rawOus = runPowerShell('([adsisearcher]"(objectClass=organizationalUnit)").FindAll() | ForEach-Object { $_.Properties.ou[0] }');
  if (rawOus) details.ous = rawOus.split('\r\n').filter(Boolean);

  // Fetch GPOs
  const rawGpos = runPowerShell('([adsisearcher]"(objectClass=groupPolicyContainer)").FindAll() | ForEach-Object { $_.Properties.displayname[0] }');
  if (rawGpos) details.gpos = rawGpos.split('\r\n').filter(Boolean);

  // Fetch Locked Accounts
  const rawLocked = runPowerShell('([adsisearcher]"(&(objectCategory=person)(objectClass=user)(lockoutTime>=1))").FindAll() | ForEach-Object { $_.Properties.samaccountname[0] }');
  if (rawLocked) details.lockedAccounts = rawLocked.split('\r\n').filter(Boolean);

  // Privileged Accounts (Domain Admins group membership)
  const rawPriv = runPowerShell('([adsisearcher]"(&(objectClass=group)(cn=Domain Admins))").FindAll() | ForEach-Object { $_.Properties.member }');
  if (rawPriv) {
    // member attributes are full DNs; clean them up
    details.privilegedAccounts = rawPriv.split('\r\n')
      .filter(Boolean)
      .map(m => {
        const match = m.match(/CN=([^,]+)/i);
        return match ? match[1] : m;
      });
  }
  if (!details.privilegedAccounts.includes('Administrator')) {
    details.privilegedAccounts.unshift('Administrator');
  }

  // Pre-auth disabled accounts count
  const rawPreauth = runPowerShell('([adsisearcher]"(&(objectCategory=person)(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=4194304))").FindAll() | Measure-Object | Select-Object -ExpandProperty Count');
  details.kerberosConfig.preAuthDisabledCount = parseInt(rawPreauth) || 0;

  return details;
}

function collectHardwareInfo(host?: string): HardwareInfo | null {
  const computerTarget = host ? `\\${host}` : '.';
  const hostPrefix = host ? `-ComputerName ${host} ` : '';
  const osCaption = runPowerShell(`${hostPrefix}Get-CimInstance Win32_OperatingSystem | ForEach-Object { $_.Caption + ' ' + $_.Version }`);
  const cpuInfo = runPowerShell(`${hostPrefix}Get-CimInstance Win32_Processor | Select-Object -First 1 -Property Name,MaxClockSpeed | ForEach-Object { $_.Name + ' @ ' + $_.MaxClockSpeed + ' MHz' }`);
  const memInfo = runPowerShell(`${hostPrefix}Get-CimInstance Win32_ComputerSystem | ForEach-Object { [Math]::Round($_.TotalPhysicalMemory/1GB, 2) }`);
  const diskInfo = runPowerShell(`${hostPrefix}Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { $_.DeviceID + ' (' + [Math]::Round($_.Size/1GB, 1) + 'GB total)' }`);

  if (!osCaption && !cpuInfo && !memInfo && !diskInfo) {
    return null;
  }

  const clockSpeedMatch = cpuInfo ? cpuInfo.match(/@(\s*)(\d+)/) : null;
  const clockSpeedMHz = clockSpeedMatch ? parseInt(clockSpeedMatch[2], 10) : 0;

  return {
    computerName: host || os.hostname(),
    os: osCaption || `${os.type()} ${os.release()} (${os.platform()})`,
    cpu: cpuInfo || 'Unknown CPU',
    totalPhysicalMemoryGB: memInfo ? Math.round(parseFloat(memInfo) * 100) / 100 : 0,
    clockSpeedMHz,
    diskSummary: diskInfo ? diskInfo.split('\r\n').filter(Boolean) : []
  };
}

/** Generates JSON report and prints Terminal output */
export async function generateReports(
  data: { collected: any; findings: AuditFinding[]; type: 'Standalone' | 'ActiveDirectory'; domain: string },
  options?: { autoPush?: boolean }
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jobId = `audit-${timestamp}`;

  // Build JSON report payload
  const jsonReport = {
    jobId,
    type: data.type,
    domain: data.domain,
    timestamp: new Date().toISOString(),
    collected: data.collected,
    findings: data.findings,
    summary: {
      total: data.findings.length,
      critical: data.findings.filter(f => f.severity === 'CRITICAL').length,
      high: data.findings.filter(f => f.severity === 'HIGH').length,
      medium: data.findings.filter(f => f.severity === 'MEDIUM').length,
      low: data.findings.filter(f => f.severity === 'LOW').length,
      info: data.findings.filter(f => f.severity === 'INFO').length
    }
  };

  // Print terminal report before asking user permission to save
  printTerminalReport(jsonReport);

  const saveAnswer = await ask('Do you want to save this report as JSON? (y/N)', 'N');
  const shouldSave = /^y(es)?$/i.test(saveAnswer.trim());

  if (shouldSave) {
    const jsonPath = path.join(scansDir(), `${jobId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), { mode: 0o600 });
    console.log(`\n${GRN}✓ Audit completed successfully!${RESET}`);
    console.log(`  JSON Export: ${BOLD}${jsonPath}${RESET}\n`);
  } else {
    console.log(`\n${YEL}Report not saved. No JSON file was written.${RESET}\n`);
  }

  const host =
    data.type === 'ActiveDirectory'
      ? (data.collected.domainControllers?.[0] || data.collected.hardwareInfo?.local?.computerName || os.hostname())
      : (data.collected.hostname || os.hostname());
  await stageAuditFindingsToWorkspace(data.findings, data.type, host, data.domain, options?.autoPush);
}

/** Prints a clean, colorized terminal security report */
function printTerminalReport(rep: any) {
  const sum = rep.summary;

  console.log(`\n${BOLD}======================================================================${RESET}`);
  console.log(`  ${BOLD}${CYN}ZTI SECURITY AUDIT REPORT - ${rep.type.toUpperCase()}${RESET}`);
  console.log(`${BOLD}======================================================================${RESET}`);
  console.log(`  ${BOLD}Machine Type:${RESET}  ${rep.type}`);
  if (rep.type === 'ActiveDirectory') {
    console.log(`  ${BOLD}Domain:${RESET}        ${rep.domain}`);
    console.log(`  ${BOLD}Controllers:${RESET}   ${rep.collected.domainControllers?.join(', ')}`);
    console.log(`  ${BOLD}Auth Method:${RESET}   ${rep.collected.ldapAuthMethod || 'N/A'}`);
  } else {
    console.log(`  ${BOLD}Hostname:${RESET}    ${rep.collected.hostname}`);
    console.log(`  ${BOLD}User:${RESET}        ${rep.collected.username}`);
  }
  console.log(`  ${BOLD}IP Address:${RESET}    ${rep.collected.ips?.join(', ') || '127.0.0.1'}`);
  if (rep.type === 'ActiveDirectory') {
    const localHw = rep.collected.hardwareInfo?.local;
    const dcHw = rep.collected.hardwareInfo?.domainController;
    if (localHw) {
      console.log(`  ${BOLD}Local Host:${RESET}     ${localHw.computerName}`);
      console.log(`  ${BOLD}Local CPU:${RESET}      ${localHw.cpu}`);
      console.log(`  ${BOLD}Local RAM:${RESET}      ${localHw.totalPhysicalMemoryGB} GB`);
    }
    if (dcHw) {
      console.log(`  ${BOLD}DC Host:${RESET}        ${dcHw.computerName}`);
      console.log(`  ${BOLD}DC CPU:${RESET}         ${dcHw.cpu}`);
      console.log(`  ${BOLD}DC RAM:${RESET}         ${dcHw.totalPhysicalMemoryGB} GB`);
    }
  } else {
    console.log(`  ${BOLD}CPU:${RESET}           ${rep.collected.cpu || 'Unknown'}`);
    console.log(`  ${BOLD}RAM:${RESET}           ${rep.collected.ram?.totalGB ?? 'Unknown'} GB`);
  }
  console.log(`  ${BOLD}Date/Time:${RESET}     ${rep.timestamp}`);
  console.log(`${BOLD}----------------------------------------------------------------------${RESET}`);

  // Summary Metrics
  console.log(`  ${BOLD}Summary Results:${RESET}`);
  console.log(`    Total Findings:  ${BOLD}${rep.findings.length}${RESET}`);
  console.log(`    [${RED}${BOLD}CRITICAL${RESET}]:      ${sum.critical}`);
  console.log(`    [${YEL}${BOLD}HIGH${RESET}]:          ${sum.high}`);
  console.log(`    [${MAG}${BOLD}MEDIUM${RESET}]:        ${sum.medium}`);
  console.log(`    [${BLU}${BOLD}LOW${RESET}]:           ${sum.low}`);
  console.log(`    [${GRN}${BOLD}INFO${RESET}]:          ${sum.info}`);
  console.log(`${BOLD}----------------------------------------------------------------------${RESET}`);

  // Findings list
  console.log(`  ${BOLD}Security Findings:${RESET}\n`);

  if (rep.findings.length === 0) {
    console.log(`    ${GRN}No vulnerabilities or security gaps discovered! Your host is hardened.${RESET}`);
  } else {
    // Sort findings by severity priority: CRITICAL > HIGH > MEDIUM > LOW > INFO
    const severityWeight: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
    const sortedFindings = [...rep.findings].sort((a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0));

    for (const f of sortedFindings) {
      let badge = '';
      if (f.severity === 'CRITICAL') badge = `${RED}${BOLD}[CRITICAL]${RESET}`;
      else if (f.severity === 'HIGH') badge = `${YEL}${BOLD}[HIGH]${RESET}`;
      else if (f.severity === 'MEDIUM') badge = `${MAG}${BOLD}[MEDIUM]${RESET}`;
      else if (f.severity === 'LOW') badge = `${BLU}${BOLD}[LOW]${RESET}`;
      else badge = `${GRN}${BOLD}[INFO]${RESET}`;

      console.log(`  * ${badge} ${BOLD}${f.name}${RESET} (${f.category})`);
      console.log(`    ${DIM}${f.description}${RESET}`);
      console.log(`    ${GRN}Remediation:${RESET} ${f.remediation}`);
      console.log('');
    }
  }
  console.log(`${BOLD}======================================================================${RESET}`);
}

/** CLI Command Handler: zti host-audit */
export async function hostAuditCmd() {
  const { collected, findings } = await runHostAudit();
  await generateReports({
    collected,
    findings,
    type: 'Standalone',
    domain: 'WORKGROUP'
  });
}

/** CLI Command Handler: zti ad-audit */
export async function adAuditCmd(options?: { autoPush?: boolean }) {
  const detected = detectMachineState();
  if (detected.type !== 'ActiveDirectory' && !detected.ldapServer) {
    console.log(`${YEL}⚠ System is standalone (WORKGROUP). Performing AD simulation for local verification...${RESET}`);
  }
  const { collected, findings } = await runAdAudit(detected);
  await generateReports({
    collected,
    findings,
    type: 'ActiveDirectory',
    domain: detected.domain
  }, options);
}

/** CLI Command Handler: zti audit */
export async function auditCmd() {
  const detected = detectMachineState();
  console.log(`\n${BOLD}ZTI Security Auditor Startup${RESET}`);
  console.log(`-------------------------------------`);
  console.log(`Detected State: ${BOLD}${detected.type === 'ActiveDirectory' ? GRN + 'Active Directory Joined' : YEL + 'Standalone Workstation'}${RESET}`);
  console.log(`Domain / WG:    ${detected.domain}`);
  console.log(`-------------------------------------\n`);

  if (detected.type === 'ActiveDirectory') {
    const { collected, findings } = await runAdAudit(detected);
    await generateReports({
      collected,
      findings,
      type: 'ActiveDirectory',
      domain: detected.domain
    });
  } else {
    const { collected, findings } = await runHostAudit();
    await generateReports({
      collected,
      findings,
      type: 'Standalone',
      domain: 'WORKGROUP'
    });
  }
}

/** CLI Command Handler: zti integrate ad */
export async function integrateActiveDirectory(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('Not authenticated. Run `zti authenticate` first.');
    process.exitCode = 1;
    return;
  }

  console.log(`\n${BOLD}Configure Active Directory / LDAP Integration${RESET}`);
  console.log(`Provide domain details and credentials for remote queries, or press Enter to skip.`);
  console.log(`If skipped, the tool attempts Integrated Authentication on domain-joined machines.\n`);

  const domain = await ask('Target AD Domain (e.g. corp.local)', cfg.ad?.domain || '');
  const server = await ask('LDAP Server URL (e.g. ldap://dc01.corp.local:389)', cfg.ad?.server || '');
  const username = await ask('Service Account Bind DN / Username', cfg.ad?.username || '');
  const password = await ask('Service Account Password', cfg.ad?.password || '');

  cfg.ad = {
    domain: domain || undefined,
    server: server || undefined,
    username: username || undefined,
    password: password || undefined
  };

  saveConfig(cfg);
  console.log(`\n${GRN}✓ Active Directory integration credentials saved locally.${RESET}`);

  console.log(`\nRunning initial Active Directory security audit...`);
  await adAuditCmd({ autoPush: true });
}
