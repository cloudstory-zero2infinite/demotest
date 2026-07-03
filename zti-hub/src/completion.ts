// `zti completion bash|zsh` — emit a shell completion script for the static
// subcommand list. Install with, e.g.:
//   zti completion bash >> ~/.bashrc        (or a file sourced by it)
//   zti completion zsh  >> ~/.zshrc
//
// Dynamic value completion (live SCF ids, scan job-ids) needs a backend round
// trip and is intentionally out of scope here — this covers the verbs/subverbs

const SUBCOMMANDS = [
  'authenticate',
  'integrate',
  'doctor',
  'start',
  'check-control',
  'check-framework',
  'vuln-scan',
  'cspm',
  'cli-logs',
  'config',
  'status',
  'completion',
  'help',
];

// Second-level words keyed by the first subcommand.
const SUBSUB: Record<string, string[]> = {
  integrate: ['gcp', 'prowler'],
  'vuln-scan': ['all', 'subnet', 'ip', 'local', 'report'],
  cspm: ['scan', 'report', 'all', 'framework', 'control', 'provider'],
  config: ['--real', '--mock'],
  completion: ['bash', 'zsh'],
};

function bashScript(): string {
  const top = SUBCOMMANDS.join(' ');
  const cases = Object.entries(SUBSUB)
    .map(([k, v]) => `      ${k}) COMPREPLY=( $(compgen -W "${v.join(' ')}" -- "$cur") ); return 0;;`)
    .join('\n');
  return `# zti bash completion
_zti_completions() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [ "\$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${top}" -- "\$cur") )
    return 0
  fi
  case "\${COMP_WORDS[1]}" in
${cases}
  esac
  return 0
}
complete -F _zti_completions zti
`;
}

function zshScript(): string {
  const top = SUBCOMMANDS.join(' ');
  const cases = Object.entries(SUBSUB)
    .map(([k, v]) => `        ${k}) compadd ${v.join(' ')} ;;`)
    .join('\n');
  return `# zti zsh completion
_zti() {
  if (( CURRENT == 2 )); then
    compadd ${top}
    return
  fi
  case "\${words[2]}" in
${cases}
  esac
}
compdef _zti zti
`;
}

export function completion(shell: string): void {
  const s = (shell || '').toLowerCase();
  if (s === 'bash') {
    console.log(bashScript());
  } else if (s === 'zsh') {
    console.log(zshScript());
  } else {
    console.error('Usage: zti completion bash | zsh');
    process.exitCode = 1;
  }
}
