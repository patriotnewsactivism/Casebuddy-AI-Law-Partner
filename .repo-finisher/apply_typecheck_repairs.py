from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:80]!r}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "components/AnalyticsDashboard.tsx",
    "  const trendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : ChevronUp;",
    "  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : ChevronUp;",
)
replace_once("components/AnalyticsDashboard.tsx", "<trendIcon size={14} />", "<TrendIcon size={14} />")

replace_once(
    "components/ArgumentPractice.tsx",
    "        confidence: 90,\n        type: 'prediction',\n        source: 'monitoring',",
    "        confidence: 90,\n        type: 'recommendation',\n        source: 'monitoring',",
)

replace_once(
    "components/CalendarView.tsx",
    "      const newConfig = { ...syncConfig, provider: syncConfig.provider === 'both' ? 'both' : provider };",
    "      const newConfig: SyncConfig = { ...syncConfig, provider: syncConfig.provider === 'both' ? 'both' : provider };",
)

replace_once(
    "components/ClientPortal.tsx",
    "import { CaseMessage, CaseStatus } from '../types';",
    "import { CaseStatus } from '../types';\nimport type { CaseMessage } from '../services/caseThreadService';",
)

replace_once(
    "components/CompanionDashboard.tsx",
    "          {greeting()}{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.",
    "          {greeting()}{user?.user_metadata?.full_name ? `, ${String(user.user_metadata.full_name).split(' ')[0]}` : ''}.",
)

replace_once(
    "components/CourtRules.tsx",
    "  const [commonDeadlines, setCommonDeadlines] = useState<DeadlineCalculation[]>([]);",
    "  const [commonDeadlines, setCommonDeadlines] = useState<JurisdictionInfo['commonDeadlines']>([]);",
)

replace_once(
    "components/DiscoveryRequests.tsx",
    "  const handleStatusUpdate = async (id: string, status: string) => {",
    "  const handleStatusUpdate = async (id: string, status: DiscoveryRequest['status']) => {",
)

replace_once(
    "components/DocumentCompare.tsx",
    "  type CompareResult, type DiffLine, type CompareOptions",
    "  type CompareResult, type DiffLine, type CompareOptions, type DiffType",
)

replace_once(
    "components/EvidenceTimeline.tsx",
    "import { Link } from 'react-router-dom';\n\nconst EvidenceTimeline = () => {",
    "import { Link } from 'react-router-dom';\n\ntype TimelineEventWithAI = TimelineEvent & { isAIExtracted?: boolean };\n\nconst EvidenceTimeline = () => {",
)
replace_once(
    "components/EvidenceTimeline.tsx",
    "  const [events, setEvents] = useState<TimelineEvent[]>([]);",
    "  const [events, setEvents] = useState<TimelineEventWithAI[]>([]);",
)
replace_once(
    "components/EvidenceTimeline.tsx",
    "    const event: TimelineEvent = {",
    "    const event: TimelineEventWithAI = {",
)
replace_once(
    "components/EvidenceTimeline.tsx",
    "                        setNewEvent({\n                          type: 'EVIDENCE' as any,\n                          status: 'pending',\n                          dateObtained: new Date().toISOString().split('T')[0]\n                        });",
    "                        setNewEvidence({\n                          type: 'EVIDENCE' as any,\n                          status: 'pending',\n                          dateObtained: new Date().toISOString().split('T')[0]\n                        });",
)

replace_once(
    "components/IntakePage.tsx",
    "printAsPdf(textToPdfHtml(letterState.text!, `Engagement Letter — ${form.name}`))",
    "printAsPdf(`Engagement Letter — ${form.name}`, textToPdfHtml(`Engagement Letter — ${form.name}`, '', letterState.text!))",
)

replace_once(
    "components/ProSeIntakeWizard.tsx",
    "import { LegalCase } from '../types';",
    "import { Case, CaseStatus } from '../types';",
)
replace_once(
    "components/ProSeIntakeWizard.tsx",
    "    const newCase: LegalCase = {\n      id: `case-${Date.now()}`,\n      title: formData.title || 'Untitled Case',\n      client: 'Myself (Pro Se)',\n      status: 'Active',\n      summary: formData.summary,\n      opposingCounsel: formData.opposingCounsel || 'Unknown',\n      nextCourtDate: formData.nextCourtDate || 'TBD',\n      trialDate: 'TBD',\n      documents: 0,\n      winProbability: 50,\n      createdAt: new Date().toISOString()\n    };",
    "    const newCase: Case = {\n      id: `case-${Date.now()}`,\n      title: formData.title || 'Untitled Case',\n      client: 'Myself (Pro Se)',\n      status: CaseStatus.PRE_TRIAL,\n      summary: formData.summary,\n      opposingCounsel: formData.opposingCounsel || 'Unknown',\n      judge: 'Unknown',\n      nextCourtDate: formData.nextCourtDate || 'TBD',\n      winProbability: 50,\n    };",
)

replace_once(
    "components/StrategyRoom.tsx",
    "          type: insight.type === 'opportunity' ? 'opportunity' : insight.type === 'risk' ? 'risk' : 'prediction',",
    "          type: insight.type === 'opportunity' ? 'opportunity' : insight.type === 'risk' ? 'risk' : 'recommendation',",
)

replace_once(
    "components/TaskQueueVisualizer.tsx",
    "        <AlertCircle size={12} className=\"ml-auto text-slate-600\" title=\"Background AI tasks\" />",
    "        <span className=\"ml-auto\" title=\"Background AI tasks\"><AlertCircle size={12} className=\"text-slate-600\" /></span>",
)

replace_once(
    "components/TubeScribe.tsx",
    "<Icon size={12} className={isCurrent && s !== 'completed' ? 'animate-spin' : ''} />",
    "<Icon size={12} className={isCurrent ? 'animate-spin' : ''} />",
)

replace_once(
    "services/analyticsService.ts",
    "import { deepseekChat } from './deepseek';",
    "import { deepseekChat } from './deepseek';\nimport { CaseStatus } from '../types';",
)
replace_once(
    "services/analyticsService.ts",
    "  const activeCases = cases.filter(c => c.status === 'active').length;",
    "  const activeCases = cases.filter(c => c.status !== CaseStatus.CLOSED).length;",
)
replace_once(
    "services/analyticsService.ts",
    "    return c.status === 'closed' && c.updatedAt && isInMonth(c.updatedAt);",
    "    return c.status === CaseStatus.CLOSED && c.updatedAt && isInMonth(c.updatedAt);",
)
replace_once(
    "services/analyticsService.ts",
    "  const closedCases = cases.filter(c => c.status === 'closed');",
    "  const closedCases = cases.filter(c => c.status === CaseStatus.CLOSED);",
)
replace_once(
    "services/analyticsService.ts",
    "    if (inv.status === 'paid' || inv.status === 'void' || inv.status === 'cancelled') return false;",
    "    if (inv.status === 'paid' || inv.status === 'cancelled') return false;",
)

replace_once(
    "services/caseContext.ts",
    "    void supabase\n      .from('case_details')\n      .select('*')\n      .eq('case_id', caseId)\n      .maybeSingle()",
    "    void Promise.resolve(supabase\n      .from('case_details')\n      .select('*')\n      .eq('case_id', caseId)\n      .maybeSingle())",
)

replace_once(
    "services/caseThreadService.ts",
    "  getAgentById, getSpecialistById, getParalegalById, getAnyPersonById,",
    "  getAgentById, getSpecialistById, getParalegalById, getParalegalsByAttorney, getAnyPersonById,",
)

print("Applied CaseBuddy browser TypeScript repairs")
