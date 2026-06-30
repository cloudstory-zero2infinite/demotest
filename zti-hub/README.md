# ZTI Hub (`zti`)

Tenant-side CLI for **Zero to Infinite — Unified Cyber Platform**. It authenticates
to your organization, integrates a cloud provider (GCP first), beacons "online" so
the main app's Control Registry ▶ buttons light up, and runs **Prowler**-based
control checks — on demand or from the queue.

> Phase 1 ships a **mock** check runner by default so the full
> Play → queue → results loop is demoable before real cloud access is wired.
> Switch to real Prowler scans with `zti config --real`.

## Install (macOS)

```bash
cd zti-hub
npm install
npm run build
npm link        # puts `zti` on your PATH
```

Requires Node ≥ 18. For **real** scans (not mock) you also need
[Prowler](https://docs.prowler.com) installed (`pipx install prowler`) and a
read-only GCP credential.

## Usage

```bash
zti authenticate                 # sign in via the app, paste the device token
zti integrate gcp                # point the hub at a read-only GCP project
zti integrate openvas            # configure Greenbone/OpenVAS credentials/host
zti integrate prowler            # install the managed Prowler scan engine
zti start                        # daemon: beacon + drain the check queue every 60s
zti check-control THR-03         # run checks for one SCF control, now
zti check-framework "CIS CSC 8.1"# run checks for every control mapped to a framework
zti config --real                # use real Prowler instead of mock results
zti status                       # config + beacon health
```

### How authentication works

`zti authenticate` opens the app and asks you to generate a **device token**
(Governance → Control Registry → the Hub connect ＋ button). The token is a
long-lived, per-device, revocable credential scoped to your organization — it is
**not** your browser session. The CLI stores it (hashed server-side) in
`~/.zti/config.json` (mode 0600) and sends it as `X-ZTI-Device-Token`.

### The demo loop

1. `zti authenticate` → `zti start` (leave it running). The app's Control
   Registry now shows **Hub online** and ▶ buttons go green.
2. In the app, press ▶ on an SCF control that has associated checks. This queues
   one job per associated check.
3. Within ~60s the hub claims the jobs, runs them (mock or Prowler), and posts
   results back. Click **results** on the row to see pass/fail

On-demand `zti check-control` / `zti check-framework` bypass the queue and run
immediately, recording results the same way.

## Config

`~/.zti/config.json`:

| key               | meaning                                            |
|-------------------|----------------------------------------------------|
| `apiBaseUrl`      | backend URL (default `http://localhost:3001`)      |
| `appUrl`          | app URL used by `authenticate` (default `:5174`)   |
| `token`           | device token (`zti_…`)                             |
| `mock`            | `true` = canned results, `false` = real Prowler    |
| `gcp.projectId`   | GCP project scanned                                |
| `gcp.credentialsPath` | read-only service-account key (blank = ADC)    |

Override `apiBaseUrl` / `appUrl` per-run with `ZTI_API_BASE_URL` / `ZTI_APP_URL`.

## Adding new checks

Checks live in the global `control_checks_library` table and are mapped to SCF
controls via `control_check_associations`. SMEs manage both in the internal tool
(**SME → Control Checks Library**). Any Prowler check id works; custom checks can
be authored later. The hub only ever runs checks an SME has associated.
