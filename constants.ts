
import { Case, CaseStatus, Witness, OpposingProfile } from './types';

// Real case data should be entered by the user.
export const MOCK_CASES: Case[] = [];

// These remain as templates for the simulation features
export const MOCK_WITNESSES: Witness[] = [
  {
    id: 'w1',
    name: 'John Smith',
    role: 'Eyewitness / Security Guard',
    personality: 'Nervous',
    credibilityScore: 85,
    avatarUrl: 'https://picsum.photos/id/1005/200/200'
  },
  {
    id: 'w2',
    name: 'Dr. Emily Chen',
    role: 'Expert Witness (Forensics)',
    personality: 'Cooperative',
    credibilityScore: 98,
    avatarUrl: 'https://picsum.photos/id/1011/200/200'
  },
  {
    id: 'w3',
    name: 'Marcus Reynolds',
    role: 'Former Employee (Hostile)',
    personality: 'Hostile',
    credibilityScore: 45,
    avatarUrl: 'https://picsum.photos/id/1025/200/200'
  }
];

export const MOCK_OPPONENT: OpposingProfile = {
  name: 'David Thorne',
  firm: 'Thorne & Partners',
  aggressiveness: 85,
  settlementTendency: 30,
  commonTactics: ['Buries evidence in volume', 'Aggressive procedural objections', 'Wait until last minute for filings']
};

// Comprehensive list of Mock Trial Types for practice
export const MOCK_CASE_TEMPLATES: { category: string, cases: Case[] }[] = [
  {
    category: "Criminal Defense",
    cases: [
      {
        id: 'temp_crim_1',
        title: 'State v. Miller (DUI Felony)',
        client: 'James Miller',
        status: CaseStatus.TRIAL,
        opposingCounsel: 'D.A. Sarah Jenkins',
        judge: 'Hon. R. Gellar',
        nextCourtDate: '2024-05-12',
        summary: 'Defending James Miller against Felony DUI charges causing bodily injury. Key issue: Accuracy of the field sobriety test and breathalyzer calibration. Defendant claims he was swerving to avoid a deer.',
        winProbability: 45
      },
      {
        id: 'temp_crim_2',
        title: 'State v. Carter (Armed Robbery)',
        client: 'Leo Carter',
        status: CaseStatus.PRE_TRIAL,
        opposingCounsel: 'A.D.A. Michael Ross',
        judge: 'Hon. L. Wright',
        nextCourtDate: '2024-06-01',
        summary: 'Armed robbery of a convenience store. Identification relies solely on grainy CCTV footage and one shaken eyewitness. Defendant has an alibi witness who is his girlfriend.',
        winProbability: 60
      },
      {
        id: 'temp_crim_3',
        title: 'State v. Vance (First Degree Murder)',
        client: 'Elias Vance',
        status: CaseStatus.TRIAL,
        opposingCounsel: 'D.A. Robert Stone',
        judge: 'Hon. K. Moten',
        nextCourtDate: '2024-07-15',
        summary: 'High-profile murder case. Client accused of poisoning business partner. Circumstantial evidence is strong (motive, opportunity), but no direct forensic link to the poison.',
        winProbability: 30
      }
    ]
  },
  {
    category: "Civil Litigation",
    cases: [
      {
        id: 'temp_civ_1',
        title: 'Johnson v. BigMart (Slip & Fall)',
        client: 'Brenda Johnson',
        status: CaseStatus.DISCOVERY,
        opposingCounsel: 'Corporate Counsel Lee',
        judge: 'Hon. P. Anderson',
        nextCourtDate: '2024-04-20',
        summary: 'Plaintiff slipped on a wet floor with no signage. Sustained spinal injury. Defense claims contributory negligence (plaintiff was texting).',
        winProbability: 70
      },
      {
        id: 'temp_civ_2',
        title: 'TechSol v. DevInc (Breach of Contract)',
        client: 'TechSol Solutions',
        status: CaseStatus.PRE_TRIAL,
        opposingCounsel: 'H. Specter',
        judge: 'Hon. B. Axelrod',
        nextCourtDate: '2024-08-10',
        summary: 'Complex commercial litigation. Defendant failed to deliver software module on agreed timeline, causing $2M in lost revenue. Defendant claims Force Majeure due to server farm fire.',
        winProbability: 55
      }
    ]
  },
  {
    category: "Civil Rights & Federal",
    cases: [
      {
        id: 'temp_fed_1',
        title: 'Williams v. Officer Smith (Section 1983)',
        client: 'Marcus Williams',
        status: CaseStatus.TRIAL,
        opposingCounsel: 'City Attorney Davis',
        judge: 'Hon. Fed. J. Marshall',
        nextCourtDate: '2024-09-05',
        summary: 'Federal civil rights claim for excessive force during a traffic stop. Police body cam footage is partial/corrupted. Qualified immunity defense raised.',
        winProbability: 40
      },
      {
        id: 'temp_fed_2',
        title: 'Gov v. Mobius Syndicate (Civil RICO)',
        client: 'The Mobius Group',
        status: CaseStatus.DISCOVERY,
        opposingCounsel: 'U.S. Attorney P. Chuck',
        judge: 'Hon. S. Kim',
        nextCourtDate: '2024-10-12',
        summary: 'Defending against Racketeer Influenced and Corrupt Organizations Act charges alleging a pattern of wire fraud and money laundering. Complex financial trail.',
        winProbability: 25
      },
      {
        id: 'temp_fed_3',
        title: 'Sterling v. The Alliance (Civil RICO)',
        client: 'Elena Sterling (Journalist)',
        status: CaseStatus.PRE_TRIAL,
        opposingCounsel: 'Joint Defense Task Force',
        judge: 'Hon. V. Stone',
        nextCourtDate: '2024-11-15',
        summary: 'Plaintiff, an investigative journalist, alleges a widespread conspiracy under RICO. She claims state and federal actors have coordinated over 5 years to silence her reporting through illegal surveillance, harassment, interference with employment, and intimidation tactics.',
        winProbability: 35
      }
    ]
  },
  {
    category: "Family Law",
    cases: [
      {
        id: 'temp_fam_1',
        title: 'Doe v. Doe (Custody Dispute)',
        client: 'Jane Doe',
        status: CaseStatus.PRE_TRIAL,
        opposingCounsel: 'L. Gold',
        judge: 'Hon. M. Judy',
        nextCourtDate: '2024-05-01',
        summary: 'Contentious custody battle. Father is seeking full custody alleging mother is unfit due to work schedule. Mother (client) has been primary caregiver for 5 years.',
        winProbability: 65
      }
    ]
  }
];
