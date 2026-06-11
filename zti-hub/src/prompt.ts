import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export async function ask(question: string, fallback = ''): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    const ans = (await rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `)).trim();
    return ans || fallback;
  } finally {
    rl.close();
  }
}
