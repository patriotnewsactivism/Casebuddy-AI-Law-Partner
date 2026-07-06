import { deepseekChat, parseDeepSeekJson } from './deepseek';

// ── Types ──────────────────────────────────────────────────────────────────────

export type CourtLevel =
  | 'federal-district'
  | 'federal-appellate'
  | 'state-trial'
  | 'state-appellate'
  | 'supreme-court'
  | 'bankruptcy'
  | 'tax-court';

export type RuleCategory =
  | 'deadlines'
  | 'filing'
  | 'service'
  | 'discovery'
  | 'motions'
  | 'evidence'
  | 'appeals'
  | 'local-rules';

export interface CourtRule {
  id: string;
  jurisdiction: string;
  court: string;
  level: CourtLevel;
  category: RuleCategory;
  title: string;
  description: string;
  citation: string;
  fullText: string;
  aiSummary: string;
  important: boolean;
  tags: string[];
  createdAt: number;
}

export interface DeadlineCalculation {
  event: string;
  triggerDate: string;
  rule: string;
  deadline: string;
  days: number;
  calendarDays: boolean;
  notes: string;
}

export interface JurisdictionInfo {
  id: string;
  name: string;
  state: string;
  level: CourtLevel;
  localRulesUrl: string;
  cmEcfUrl: string;
  judges: string[];
  commonDeadlines: { event: string; days: number; calendarDays: boolean; citation: string }[];
}

// ── Storage ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'casebuddy_court_rules_cache';

const isLocalStorageAvailable = (): boolean => {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
};

const loadRules = (): CourtRule[] => {
  if (!isLocalStorageAvailable()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveRules = (rules: CourtRule[]): void => {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // storage full — silently ignore
  }
};

const generateRuleId = (): string =>
  `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ── Court Rules ────────────────────────────────────────────────────────────────

export const getCourtRules = (jurisdiction?: string, category?: RuleCategory): CourtRule[] => {
  let rules = loadRules();
  if (jurisdiction) {
    rules = rules.filter(r => r.jurisdiction.toLowerCase() === jurisdiction.toLowerCase());
  }
  if (category) {
    rules = rules.filter(r => r.category === category);
  }
  return rules.sort((a, b) => b.createdAt - a.createdAt);
};

export const saveCourtRule = (rule: CourtRule): void => {
  const rules = loadRules();
  const idx = rules.findIndex(r => r.id === rule.id);
  if (idx >= 0) {
    rules[idx] = { ...rule, createdAt: rule.createdAt || rules[idx].createdAt };
  } else {
    rules.push({ ...rule, id: rule.id || generateRuleId(), createdAt: rule.createdAt || Date.now() });
  }
  saveRules(rules);
};

export const deleteCourtRule = (id: string): void => {
  const rules = loadRules().filter(r => r.id !== id);
  saveRules(rules);
};

export const searchCourtRules = (query: string): CourtRule[] => {
  if (!query.trim()) return getCourtRules();
  const q = query.toLowerCase();
  return loadRules().filter(r =>
    r.title.toLowerCase().includes(q) ||
    r.description.toLowerCase().includes(q) ||
    r.citation.toLowerCase().includes(q) ||
    r.fullText.toLowerCase().includes(q)
  ).sort((a, b) => b.createdAt - a.createdAt);
};

export const getRulesByCategory = (category: RuleCategory): CourtRule[] => {
  return loadRules().filter(r => r.category === category).sort((a, b) => b.createdAt - a.createdAt);
};

export const starRule = (id: string): void => {
  const rules = loadRules();
  const rule = rules.find(r => r.id === id);
  if (rule) {
    rule.important = !rule.important;
    saveRules(rules);
  }
};

export const generateRuleSummary = async (ruleText: string, citation: string): Promise<string> => {
  if (!ruleText.trim()) return 'No rule text provided.';

  try {
    const response = await deepseekChat({
      systemInstruction: 'You are a legal expert who translates court rules into plain English summaries suitable for attorneys who need a quick overview. Keep summaries under 150 words. Focus on what the rule practically requires.',
      messages: [
        {
          role: 'user',
          content: `Summarize the following court rule in plain English (under 150 words). Focus on what attorneys need to know procedurally.\n\nCitation: ${citation}\n\nRule text:\n${ruleText}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 300,
    });
    return response.trim();
  } catch {
    return 'AI summary unavailable. Please review the full rule text.';
  }
};

// ── Deadline Calculation ───────────────────────────────────────────────────────

export const calculateDeadlines = async (
  eventDate: string,
  jurisdiction: string,
  eventType: string,
): Promise<DeadlineCalculation[]> => {
  if (!eventDate || !jurisdiction || !eventType) return [];

  try {
    const response = await deepseekChat({
      systemInstruction: `You are a federal and state court deadline calculator. Given a triggering event, event date, and jurisdiction, return a JSON object with a "deadlines" array containing every relevant procedural deadline.

Each deadline entry must have:
- event: description of the triggering event (the input eventType)
- triggerDate: the ISO date provided
- rule: citation of the governing rule (e.g. "FRCP 12(a)(1)(A)", "Local Rule 7-3", "FRCP 26(a)(1)")
- deadline: calculated deadline as ISO date string
- days: number of days from trigger to deadline
- calendarDays: true for calendar days, false for court/business days
- notes: short explanation of what must be done by this deadline

FRCP rules on which you must be accurate:
- FRCP 12(a)(1)(A): answer due 21 days after service of complaint
- FRCP 12(a)(4): reply to answer due 21 days after service of answer if court orders
- FRCP 15(a)(1): amended pleading 21 days after service, or 21 days after service of responsive pleading
- FRCP 26(a)(1): initial disclosures 14 days after Rule 26(f) conference
- FRCP 26(f): conference 21 days before scheduling order deadline, typically 60-90 days after complaint
- FRCP 38(b): jury demand 14 days after last pleading
- FRCP 56: summary judgment 30 days after close of discovery (unless local rule sets different)
- FRCP 59(b): new trial motion 28 days after entry of judgment
- FRCP 4(m): service must be completed within 90 days of filing complaint
- FRCP 26(a)(2): expert disclosures at least 90 days before trial (or as court orders)
- FRCP 26(a)(3): pretrial disclosures at least 30 days before trial
- FRCP 33(b)(2): interrogatory responses 30 days after service
- FRCP 34(b)(2): document requests responses 30 days after service
- FRCP 36(a)(3): requests for admission responses 30 days after service
- FRCP 26(b)(5): privilege log with discovery responses (typically 30 days)

- 28 U.S.C. § 1446(b): notice of removal 30 days after service of complaint (federal removal)
- FRAP 4(a)(1): notice of appeal 30 days after judgment (60 days if US is a party)

For state courts, apply analogous state rules if the jurisdiction specifies a state court. For state trial courts, typical deadlines:
- Answer due 20-30 days after service (varies by state; e.g., CA: 30 days, NY: 20-30 days, TX: Monday after 20 days, FL: 20 days, IL: 30 days, DE: 20 days)
- Discovery responses 30 days after service
- Motions typically on 14-21 day notice

Return ONLY valid JSON in this exact shape:
{ "deadlines": [{ "event": string, "triggerDate": string, "rule": string, "deadline": string, "days": number, "calendarDays": boolean, "notes": string }] }

Today's date is ${new Date().toISOString().split('T')[0]}. Use this only if no eventDate is meaningful; otherwise use the provided eventDate.`,
      messages: [
        {
          role: 'user',
          content: `Triggering event: ${eventType}\nEvent date: ${eventDate}\nJurisdiction: ${jurisdiction}\n\nCalculate all relevant procedural deadlines. Return JSON only.`,
        },
      ],
      temperature: 0.1,
      jsonMode: true,
    });

    const parsed = parseDeepSeekJson<{ deadlines: DeadlineCalculation[] }>(response, { deadlines: [] });
    return parsed.deadlines || [];
  } catch {
    return [];
  }
};

export const getCommonDeadlines = (jurisdiction: string): DeadlineCalculation[] => {
  try {
    const cached = localStorage.getItem(`${STORAGE_KEY}_deadlines_${jurisdiction}`);
    if (cached) {
      return JSON.parse(cached) as DeadlineCalculation[];
    }
  } catch {
    // no cache
  }
  return [];
};

// ── Jurisdictions ──────────────────────────────────────────────────────────────

const HARDCODED_JURISDICTIONS: JurisdictionInfo[] = [
  {
    id: 'sdny',
    name: 'Southern District of New York',
    state: 'NY',
    level: 'federal-district',
    localRulesUrl: 'https://nysd.uscourts.gov/rules',
    cmEcfUrl: 'https://ecf.nysd.uscourts.gov',
    judges: ['Judge J. Paul Oetken', 'Judge Katherine Polk Failla', 'Judge Lewis J. Liman'],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 21, calendarDays: true, citation: 'FRCP 12(a)(1)(A)' },
      { event: 'Initial disclosures', days: 14, calendarDays: true, citation: 'FRCP 26(a)(1)' },
      { event: 'Summary judgment motion', days: 30, calendarDays: true, citation: 'FRCP 56 / Local Rule 56.1' },
    ],
  },
  {
    id: 'edny',
    name: 'Eastern District of New York',
    state: 'NY',
    level: 'federal-district',
    localRulesUrl: 'https://nyed.uscourts.gov/rules',
    cmEcfUrl: 'https://ecf.nyed.uscourts.gov',
    judges: ['Judge Margo K. Brodie', 'Judge Pamela K. Chen'],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 21, calendarDays: true, citation: 'FRCP 12(a)(1)(A)' },
      { event: 'Initial disclosures', days: 14, calendarDays: true, citation: 'FRCP 26(a)(1)' },
    ],
  },
  {
    id: 'ndca',
    name: 'Northern District of California',
    state: 'CA',
    level: 'federal-district',
    localRulesUrl: 'https://cand.uscourts.gov/rules',
    cmEcfUrl: 'https://ecf.cand.uscourts.gov',
    judges: ['Judge Vince Chhabria', 'Judge Yvonne Gonzalez Rogers', 'Judge Jon S. Tigar'],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 21, calendarDays: true, citation: 'FRCP 12(a)(1)(A)' },
      { event: 'Initial disclosures', days: 14, calendarDays: true, citation: 'FRCP 26(a)(1)' },
      { event: 'ADR certification', days: 21, calendarDays: true, citation: 'Local Rule 16-8(b)' },
    ],
  },
  {
    id: 'cdca',
    name: 'Central District of California',
    state: 'CA',
    level: 'federal-district',
    localRulesUrl: 'https://cacd.uscourts.gov/rules',
    cmEcfUrl: 'https://ecf.cacd.uscourts.gov',
    judges: ['Judge Dolly M. Gee', 'Judge Stephen V. Wilson'],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 21, calendarDays: true, citation: 'FRCP 12(a)(1)(A)' },
      { event: 'Initial disclosures', days: 14, calendarDays: true, citation: 'FRCP 26(a)(1)' },
    ],
  },
  {
    id: 'ddc',
    name: 'District of Columbia',
    state: 'DC',
    level: 'federal-district',
    localRulesUrl: 'https://dcd.uscourts.gov/rules',
    cmEcfUrl: 'https://ecf.dcd.uscourts.gov',
    judges: ['Judge Beryl A. Howell', 'Judge Amit P. Mehta'],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 21, calendarDays: true, citation: 'FRCP 12(a)(1)(A)' },
    ],
  },
  {
    id: 'ndtx',
    name: 'Northern District of Texas',
    state: 'TX',
    level: 'federal-district',
    localRulesUrl: 'https://txnd.uscourts.gov/rules',
    cmEcfUrl: 'https://ecf.txnd.uscourts.gov',
    judges: ['Judge Reed O\'Connor', 'Judge Karen Gren Scholer'],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 21, calendarDays: true, citation: 'FRCP 12(a)(1)(A)' },
    ],
  },
  {
    id: 'ndil',
    name: 'Northern District of Illinois',
    state: 'IL',
    level: 'federal-district',
    localRulesUrl: 'https://ilnd.uscourts.gov/rules',
    cmEcfUrl: 'https://ecf.ilnd.uscourts.gov',
    judges: ['Judge Virginia M. Kendall', 'Judge John Robert Blakey'],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 21, calendarDays: true, citation: 'FRCP 12(a)(1)(A)' },
      { event: 'Initial disclosures', days: 14, calendarDays: true, citation: 'FRCP 26(a)(1)' },
    ],
  },
  {
    id: 'sdtx',
    name: 'Southern District of Texas',
    state: 'TX',
    level: 'federal-district',
    localRulesUrl: 'https://txsd.uscourts.gov/rules',
    cmEcfUrl: 'https://ecf.txsd.uscourts.gov',
    judges: ['Judge Lee H. Rosenthal', 'Judge David Hittner'],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 21, calendarDays: true, citation: 'FRCP 12(a)(1)(A)' },
    ],
  },
  {
    id: 'de-chancery',
    name: 'Delaware Court of Chancery',
    state: 'DE',
    level: 'state-trial',
    localRulesUrl: 'https://courts.delaware.gov/chancery/rules.aspx',
    cmEcfUrl: 'https://courts.delaware.gov/chancery/efiling.aspx',
    judges: ['Chancellor Kathaleen St. J. McCormick', 'Vice Chancellor J. Travis Laster'],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 20, calendarDays: true, citation: 'Chancery Rule 12(a)' },
      { event: 'Summary judgment', days: 30, calendarDays: true, citation: 'Chancery Rule 56' },
    ],
  },
  {
    id: 'de-district',
    name: 'District of Delaware',
    state: 'DE',
    level: 'federal-district',
    localRulesUrl: 'https://ded.uscourts.gov/rules',
    cmEcfUrl: 'https://ecf.ded.uscourts.gov',
    judges: ['Judge Colm F. Connolly', 'Judge Richard G. Andrews'],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 21, calendarDays: true, citation: 'FRCP 12(a)(1)(A)' },
      { event: 'Summary judgment', days: 30, calendarDays: true, citation: 'FRCP 56' },
    ],
  },
  {
    id: 'ca9',
    name: 'Ninth Circuit Court of Appeals',
    state: 'CA',
    level: 'federal-appellate',
    localRulesUrl: 'https://ca9.uscourts.gov/rules/',
    cmEcfUrl: 'https://ecf.ca9.uscourts.gov',
    judges: ['Judge John B. Owens', 'Judge Michelle T. Friedland'],
    commonDeadlines: [
      { event: 'Notice of appeal', days: 30, calendarDays: true, citation: 'FRAP 4(a)(1)(A)' },
      { event: 'Opening brief', days: 40, calendarDays: true, citation: 'FRAP 31 / 9th Cir. Rule 31-2.2' },
    ],
  },
  {
    id: 'ca2',
    name: 'Second Circuit Court of Appeals',
    state: 'NY',
    level: 'federal-appellate',
    localRulesUrl: 'https://ca2.uscourts.gov/rules',
    cmEcfUrl: 'https://ecf.ca2.uscourts.gov',
    judges: ['Judge Debra Ann Livingston', 'Judge Steven J. Menashi'],
    commonDeadlines: [
      { event: 'Notice of appeal', days: 30, calendarDays: true, citation: 'FRAP 4(a)(1)(A)' },
      { event: 'Opening brief', days: 40, calendarDays: true, citation: 'FRAP 31' },
    ],
  },
  {
    id: 'federal-circuit',
    name: 'Federal Circuit Court of Appeals',
    state: 'DC',
    level: 'federal-appellate',
    localRulesUrl: 'https://cafc.uscourts.gov/rules',
    cmEcfUrl: 'https://ecf.cafc.uscourts.gov',
    judges: ['Judge Kimberly A. Moore', 'Judge Richard G. Taranto'],
    commonDeadlines: [
      { event: 'Notice of appeal', days: 30, calendarDays: true, citation: 'FRAP 4(a)(1)(A)' },
    ],
  },
  {
    id: 'ca-trial',
    name: 'California Superior Court (All Counties)',
    state: 'CA',
    level: 'state-trial',
    localRulesUrl: 'https://www.courts.ca.gov/rules.htm',
    cmEcfUrl: '',
    judges: [],
    commonDeadlines: [
      { event: 'Answer to complaint (personal injury)', days: 30, calendarDays: true, citation: 'CCP § 412.20(a)(3)' },
      { event: 'Discovery responses', days: 30, calendarDays: true, citation: 'CCP § 2030.260' },
      { event: 'Summary judgment', days: 75, calendarDays: true, citation: 'CCP § 437c(a)' },
    ],
  },
  {
    id: 'ny-trial',
    name: 'New York State Supreme Court',
    state: 'NY',
    level: 'state-trial',
    localRulesUrl: 'https://www.nycourts.gov/rules/',
    cmEcfUrl: '',
    judges: [],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 20, calendarDays: true, citation: 'CPLR 320(a)' },
      { event: 'Discovery responses', days: 30, calendarDays: true, citation: 'CPLR 3122' },
      { event: 'Summary judgment', days: 120, calendarDays: true, citation: 'CPLR 3212(a)' },
    ],
  },
  {
    id: 'tx-trial',
    name: 'Texas District Court',
    state: 'TX',
    level: 'state-trial',
    localRulesUrl: 'https://www.txcourts.gov/rules/',
    cmEcfUrl: '',
    judges: [],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 20, calendarDays: false, citation: 'TRCP 99(b)' },
      { event: 'Discovery responses', days: 30, calendarDays: true, citation: 'TRCP 196.2' },
    ],
  },
  {
    id: 'fl-trial',
    name: 'Florida Circuit Court',
    state: 'FL',
    level: 'state-trial',
    localRulesUrl: 'https://www.flcourts.gov/rules/',
    cmEcfUrl: '',
    judges: [],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 20, calendarDays: true, citation: 'Fla. R. Civ. P. 1.140(a)' },
      { event: 'Discovery responses', days: 30, calendarDays: true, citation: 'Fla. R. Civ. P. 1.340' },
    ],
  },
  {
    id: 'il-trial',
    name: 'Illinois Circuit Court',
    state: 'IL',
    level: 'state-trial',
    localRulesUrl: 'https://www.illinoiscourts.gov/rules/',
    cmEcfUrl: '',
    judges: [],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 30, calendarDays: true, citation: '735 ILCS 5/2-610' },
      { event: 'Discovery responses', days: 28, calendarDays: true, citation: 'Ill. Sup. Ct. R. 213' },
    ],
  },
  {
    id: 'de-trial',
    name: 'Delaware Superior Court',
    state: 'DE',
    level: 'state-trial',
    localRulesUrl: 'https://courts.delaware.gov/superior/rules.aspx',
    cmEcfUrl: '',
    judges: [],
    commonDeadlines: [
      { event: 'Answer to complaint', days: 20, calendarDays: true, citation: 'Del. Super. Ct. R. 12(a)' },
    ],
  },
];

export const getJurisdictions = (): JurisdictionInfo[] => {
  return HARDCODED_JURISDICTIONS;
};

export const getJurisdictionById = (id: string): JurisdictionInfo | undefined => {
  return HARDCODED_JURISDICTIONS.find(j => j.id === id);
};

export const searchJurisdictions = (query: string): JurisdictionInfo[] => {
  if (!query.trim()) return HARDCODED_JURISDICTIONS;
  const q = query.toLowerCase();
  return HARDCODED_JURISDICTIONS.filter(j =>
    j.name.toLowerCase().includes(q) ||
    j.state.toLowerCase().includes(q) ||
    j.id.toLowerCase().includes(q)
  );
};

// ── Seed Common Rules ──────────────────────────────────────────────────────────

export const seedCommonRules = (): void => {
  const existing = loadRules();
  if (existing.length > 0) return;

  const now = Date.now();
  const commonRules: CourtRule[] = [
    {
      id: generateRuleId(),
      jurisdiction: 'Federal',
      court: 'All Federal District Courts',
      level: 'federal-district',
      category: 'motions',
      title: 'Motions to Dismiss — Time to Respond',
      description: 'A defendant must serve an answer within 21 days after being served with the summons and complaint. If a Rule 12 motion is timely filed, then the responsive pleading deadline resets: if the court denies the motion or postpones disposition, the responsive pleading must be served within 14 days after notice of the court\'s action.',
      citation: 'FRCP 12(a)(1)(A)',
      fullText: '(a) Time to Serve a Responsive Pleading.\n(1) In General. Unless another time is specified by this rule or a federal statute, the time for serving a responsive pleading is as follows:\n(A) A defendant must serve an answer:\n(i) within 21 days after being served with the summons and complaint; or\n(ii) if it has timely waived service under Rule 4(d), within 60 days after the request for waiver was sent, or within 90 days after it was sent to the defendant outside any judicial district of the United States.\n(B) A party must serve an answer to a counterclaim or crossclaim within 21 days after being served with the pleading that states the counterclaim or crossclaim.\n(C) A party must serve a reply to an answer within 21 days after being served with an order to reply, unless the order specifies a different time.\n(2) United States and Its Agencies, Officers, or Employees Sued in an Official Capacity. The United States, a United States agency, or a United States officer or employee sued only in an official capacity must serve an answer to a complaint, counterclaim, or crossclaim within 60 days after service on the United States attorney.\n(3) United States Officers or Employees Sued in an Individual Capacity. A United States officer or employee sued in an individual capacity for an act or omission occurring in connection with duties performed on the United States\' behalf must serve an answer to a complaint, counterclaim, or crossclaim within 60 days after service on the officer or employee or service on the United States attorney, whichever is later.\n(4) Effect of a Motion. Unless the court sets a different time, serving a motion under this rule alters these periods as follows:\n(A) if the court denies the motion or postpones its disposition until trial, the responsive pleading must be served within 14 days after notice of the court\'s action; or\n(B) if the court grants a motion for a more definite statement, the responsive pleading must be served within 14 days after the more definite statement is served.',
      aiSummary: 'After being served with a complaint, a defendant generally has 21 days to file an answer. If the defendant files a motion to dismiss instead of answering, the clock pauses. If the judge denies that motion, the defendant gets 14 days from the ruling to file the answer. For the United States or its agencies sued in an official capacity, the deadline is 60 days.',
      important: true,
      tags: ['FRCP', 'responsive pleading', 'motions to dismiss', 'answer deadline'],
      createdAt: now,
    },
    {
      id: generateRuleId(),
      jurisdiction: 'Federal',
      court: 'All Federal District Courts',
      level: 'federal-district',
      category: 'discovery',
      title: 'Initial Disclosures — Timing and Scope',
      description: 'Parties must make initial disclosures within 14 days after the Rule 26(f) discovery conference, unless a different time is set by stipulation or court order. A party that is first served or otherwise joined after the Rule 26(f) conference must make its initial disclosures within 30 days after being served or joined, unless a different time is set by stipulation or court order.',
      citation: 'FRCP 26(a)(1)',
      fullText: '(a) Required Disclosures.\n(1) Initial Disclosure.\n(A) In General. Except as exempted by Rule 26(a)(1)(B) or as otherwise stipulated or ordered by the court, a party must, without awaiting a discovery request, provide to the other parties:\n(i) the name and, if known, the address and telephone number of each individual likely to have discoverable information—along with the subjects of that information—that the disclosing party may use to support its claims or defenses, unless the use would be solely for impeachment;\n(ii) a copy—or a description by category and location—of all documents, electronically stored information, and tangible things that the disclosing party has in its possession, custody, or control and may use to support its claims or defenses, unless the use would be solely for impeachment;\n(iii) a computation of each category of damages claimed by the disclosing party—who must also make available for inspection and copying as under Rule 34 the documents or other evidentiary material, unless privileged or protected from disclosure, on which each computation is based, including materials bearing on the nature and extent of injuries suffered; and\n(iv) for inspection and copying as under Rule 34, any insurance agreement under which an insurance business may be liable to satisfy all or part of a possible judgment in the action or to indemnify or reimburse for payments made to satisfy the judgment.\n(C) Time for Initial Disclosures—In General. A party must make the initial disclosures at or within 14 days after the parties\' Rule 26(f) conference unless a different time is set by stipulation or court order, or unless a party objects during the conference that initial disclosures are not appropriate in this action and states the objection in the proposed discovery plan. In ruling on the objection, the court must determine what disclosures, if any, are to be made and must set the time for disclosure.\n(D) Time for Initial Disclosures—For Parties Served or Joined Later. A party that is first served or otherwise joined after the Rule 26(f) conference must make the initial disclosures within 30 days after being served or joined, unless a different time is set by stipulation or court order.',
      aiSummary: 'Within 14 days after the discovery planning conference, both sides must automatically share basic information without being asked. This includes names of people with relevant knowledge, copies or descriptions of key documents, a damages calculation, and any insurance policies. A party joined after the conference gets 30 days. This disclosure obligation continues throughout the case as new information surfaces.',
      important: true,
      tags: ['FRCP', 'discovery', 'initial disclosures', 'Rule 26(f) conference'],
      createdAt: now,
    },
    {
      id: generateRuleId(),
      jurisdiction: 'Federal',
      court: 'All Federal District Courts',
      level: 'federal-district',
      category: 'motions',
      title: 'Summary Judgment — Timing',
      description: 'Unless a different time is set by local rule or court order, a party may file a motion for summary judgment at any time until 30 days after the close of all discovery. The court will grant summary judgment if the movant shows there is no genuine dispute as to any material fact and the movant is entitled to judgment as a matter of law.',
      citation: 'FRCP 56',
      fullText: '(a) Motion for Summary Judgment or Partial Summary Judgment. A party may move for summary judgment, identifying each claim or defense—or the part of each claim or defense—on which summary judgment is sought. The court shall grant summary judgment if the movant shows that there is no genuine dispute as to any material fact and the movant is entitled to judgment as a matter of law. The court should state on the record the reasons for granting or denying the motion.\n(b) Time to File a Motion. Unless a different time is set by local rule or the court orders otherwise, a party may file a motion for summary judgment at any time until 30 days after the close of all discovery.\n(c) Procedures.\n(1) Supporting Factual Positions. A party asserting that a fact cannot be or is genuinely disputed must support the assertion by:\n(A) citing to particular parts of materials in the record, including depositions, documents, electronically stored information, affidavits or declarations, stipulations (including those made for purposes of the motion only), admissions, interrogatory answers, or other materials; or\n(B) showing that the materials cited do not establish the absence or presence of a genuine dispute, or that an adverse party cannot produce admissible evidence to support the fact.\n(2) Objection That a Fact Is Not Supported by Admissible Evidence. A party may object that the material cited to support or dispute a fact cannot be presented in a form that would be admissible in evidence.\n(3) Materials Not Cited. The court need consider only the cited materials, but it may consider other materials in the record.\n(4) Affidavits or Declarations. An affidavit or declaration used to support or oppose a motion must be made on personal knowledge, set out facts that would be admissible in evidence, and show that the affiant or declarant is competent to testify on the matters stated.',
      aiSummary: 'A summary judgment motion asks the court to decide the case (or part of it) without a trial because there is no real factual dispute. You can file it up until 30 days after discovery closes. You must support your position with evidence—depositions, documents, affidavits—showing the key facts are undisputed. If the other side can\'t produce evidence creating a genuine dispute, the judge can rule in your favor as a matter of law.',
      important: true,
      tags: ['FRCP', 'summary judgment', 'dispositive motions', 'trial'],
      createdAt: now,
    },
    {
      id: generateRuleId(),
      jurisdiction: 'Federal',
      court: 'All Federal District Courts',
      level: 'federal-district',
      category: 'service',
      title: 'Time Limit for Service of Process',
      description: 'If a defendant is not served within 90 days after the complaint is filed, the court—on motion or on its own after notice to the plaintiff—must dismiss the action without prejudice against that defendant or order that service be made within a specified time. But if the plaintiff shows good cause for the failure, the court must extend the time for service for an appropriate period.',
      citation: 'FRCP 4(m)',
      fullText: '(m) Time Limit for Service. If a defendant is not served within 90 days after the complaint is filed, the court—on motion or on its own after notice to the plaintiff—must dismiss the action without prejudice against that defendant or order that service be made within a specified time. But if the plaintiff shows good cause for the failure, the court must extend the time for service for an appropriate period. This subdivision (m) does not apply to service in a foreign country under Rule 4(f) or 4(j)(1) or to service of a notice under Rule 71.1(d)(3)(A).',
      aiSummary: 'You have 90 days from the day you file the complaint to serve the defendant. If you miss this deadline, the court can dismiss your case (without prejudice, meaning you could refile if the statute of limitations hasn\'t run). If you had a good reason for the delay, the court must give you more time. This rule does not apply to serving defendants in foreign countries.',
      important: true,
      tags: ['FRCP', 'service of process', 'dismissal', 'deadline'],
      createdAt: now,
    },
    {
      id: generateRuleId(),
      jurisdiction: 'Federal',
      court: 'All Federal District Courts',
      level: 'federal-district',
      category: 'motions',
      title: 'Jury Trial Demand',
      description: 'A party may demand a jury trial by serving the other parties with a written demand no later than 14 days after the last pleading directed to the issue is served, and filing the demand with the court. A proper demand may not be withdrawn without the consent of all parties.',
      citation: 'FRCP 38(b)',
      fullText: '(b) Demand. On any issue triable of right by a jury, a party may demand a jury trial by:\n(1) serving the other parties with a written demand—which may be included in a pleading—no later than 14 days after the last pleading directed to the issue is served; and\n(2) filing the demand in accordance with Rule 5(d).\n(d) Waiver; Withdrawal. A party waives a jury trial unless its demand is properly served and filed. A proper demand may be withdrawn only if the parties consent.',
      aiSummary: 'If you want a jury trial, you must make a written demand and serve it on the other parties within 14 days after the last pleading on that issue is served. Your demand can be in a pleading (like an answer or complaint). If you don\'t do this, you waive your right to a jury and the judge will decide the case. Once requested, you can\'t withdraw the demand without the other side\'s consent.',
      important: false,
      tags: ['FRCP', 'jury trial', 'waiver', 'pleading'],
      createdAt: now,
    },
    {
      id: generateRuleId(),
      jurisdiction: 'Federal',
      court: 'All Federal District Courts',
      level: 'federal-district',
      category: 'motions',
      title: 'Motion for New Trial or to Alter or Amend Judgment',
      description: 'A motion for a new trial or to alter or amend a judgment must be filed no later than 28 days after the entry of judgment. The court may grant a new trial on all or some issues for any reason for which a new trial has been granted in federal court.',
      citation: 'FRCP 59(b)',
      fullText: '(b) Time to File a Motion for a New Trial. A motion for a new trial must be filed no later than 28 days after the entry of judgment.\n(e) Motion to Alter or Amend a Judgment. A motion to alter or amend a judgment must be filed no later than 28 days after the entry of the judgment.',
      aiSummary: 'After a judgment is entered, you have 28 days to ask the court for a new trial or to change the judgment. This is a strict deadline—the court cannot extend it. If you miss it, your only path is an appeal, which is governed by different rules and timelines.',
      important: false,
      tags: ['FRCP', 'new trial', 'post-trial', 'judgment', 'deadline'],
      createdAt: now,
    },
  ];

  saveRules(commonRules);
};
