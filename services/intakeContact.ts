export interface IntakeContact {
  email: string;
  phone: string;
}

type TranscriptTurn = { speaker: string; text: string };

const USER_SPEAKERS = new Set(['you', 'user', 'caller', 'client']);
const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0',
  one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9',
};

export const normalizePhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length === 10) {
    return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  return value.trim();
};

export const isValidPhone = (value: string): boolean => {
  const count = value.replace(/\D/g, '').length;
  return count >= 10 && count <= 15;
};

export const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim());

function spokenEmail(text: string): string {
  const match = text.toLowerCase().match(
    /([a-z0-9]+(?:\s+(?:dot|period|underscore|dash|hyphen|plus)\s+[a-z0-9]+)*)\s+(?:at|at sign)\s+([a-z0-9]+(?:\s+(?:dot|period|dash|hyphen)\s+[a-z0-9]+)+)/i,
  );
  if (!match) return '';

  const clean = (part: string) => part
    .replace(/\s+(?:dot|period)\s+/g, '.')
    .replace(/\s+underscore\s+/g, '_')
    .replace(/\s+(?:dash|hyphen)\s+/g, '-')
    .replace(/\s+plus\s+/g, '+')
    .replace(/\s+/g, '');
  const candidate = `${clean(match[1])}@${clean(match[2])}`;
  return isValidEmail(candidate) ? candidate : '';
}

function spokenPhone(text: string): string {
  const token = '(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|o|[0-9])';
  const sequences = text.toLowerCase().match(new RegExp(`\\b${token}\\b(?:[\\s,.-]+\\b${token}\\b){6,14}`, 'g')) || [];
  for (const sequence of sequences) {
    const digits = (sequence.match(new RegExp(`\\b${token}\\b`, 'g')) || [])
      .map(part => DIGIT_WORDS[part] ?? part)
      .join('');
    if (digits.length >= 10 && digits.length <= 15) return normalizePhone(digits);
  }
  return '';
}

/** Extract only caller-provided contact details from a voice transcript. */
export function extractContactFromTranscript(turns: TranscriptTurn[]): IntakeContact {
  const callerText = turns
    .filter(turn => USER_SPEAKERS.has(String(turn.speaker).toLowerCase()))
    .map(turn => turn.text)
    .join(' ');

  const directEmail = callerText.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/i)?.[0] || '';
  const directPhone = callerText.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0] || '';
  return {
    email: (directEmail || spokenEmail(callerText)).trim().toLowerCase(),
    phone: normalizePhone(directPhone || spokenPhone(callerText)),
  };
}
