// Streaming progress reporter for the internal-tool Queue Analytics runner.
// Appends one JSON line per lifecycle event to QA_PROGRESS_FILE so the
// Express server can tail it and surface live status while a run is in flight.
// Only active when passed explicitly via --reporter; normal test runs are
// unaffected.
const fs = require('fs');

const OUT = process.env.QA_PROGRESS_FILE;

function suiteOf(file) {
  const parts = String(file || '').split(/e2e[\/\\]specs[\/\\]/);
  if (parts.length < 2) return '';
  return parts[1].split(/[\/\\]/)[0] || '';
}

// onTestEnd reports raw statuses; collapse them to the runner's vocabulary.
function normalize(status) {
  if (status === 'timedOut' || status === 'interrupted') return 'failed';
  return status; // passed | failed | skipped
}

class QaProgressReporter {
  onBegin(_config, suite) {
    this._total = suite.allTests().length;
    this._write({ type: 'begin', total: this._total });
  }

  onTestEnd(test, result) {
    this._write({
      type: 'test',
      suite: suiteOf(test.location && test.location.file),
      title: test.title,
      status: normalize(result.status),
      durationMs: result.duration || 0,
    });
  }

  onEnd(result) {
    this._write({ type: 'end', status: result && result.status });
  }

  _write(obj) {
    if (!OUT) return;
    try {
      fs.appendFileSync(OUT, JSON.stringify(obj) + '\n');
    } catch {
      /* best-effort; never break the run over progress logging */
    }
  }
}

module.exports = QaProgressReporter;
