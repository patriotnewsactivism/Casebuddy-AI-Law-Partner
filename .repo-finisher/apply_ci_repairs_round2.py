from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


# Browser TypeScript: preserve DeadlineCalculation as the cached/AI result contract
# and render its governing rule instead of pretending it is a JurisdictionInfo deadline.
replace_once(
    "components/CourtRules.tsx",
    "  const [commonDeadlines, setCommonDeadlines] = useState<JurisdictionInfo['commonDeadlines']>([]);",
    "  const [commonDeadlines, setCommonDeadlines] = useState<DeadlineCalculation[]>([]);",
)
replace_once(
    "components/CourtRules.tsx",
    "<span className=\"text-xs text-gold-400 font-mono\">{cd.citation}</span>",
    "<span className=\"text-xs text-gold-400 font-mono\">{cd.rule}</span>",
)

# Object.entries widens keys to string; narrow only at the typed status boundary.
replace_once(
    "components/DiscoveryRequests.tsx",
    "onClick={() => handleStatusUpdate(req.id, key)}",
    "onClick={() => handleStatusUpdate(req.id, key as DiscoveryRequest['status'])}",
)

# Edge Function strict typing: make provider helper contracts explicit.
replace_once(
    "supabase/functions/ocr-document/index.ts",
    "    const geminiOcr = async (fileBlob, mimeType, isImage) => {",
    "    const geminiOcr = async (fileBlob: Blob, mimeType: string, isImage: boolean): Promise<string> => {",
)
replace_once(
    "supabase/functions/ocr-document/index.ts",
    "    const ocrSpaceExtract = async (blob, isImage, ct) => {",
    "    const ocrSpaceExtract = async (blob: Blob, isImage: boolean, ct: string): Promise<string> => {",
)
replace_once(
    "supabase/functions/ocr-document/index.ts",
    "              'analysis'\n            );",
    "              'ANALYSIS'\n            );",
)
replace_once(
    "supabase/functions/ocr-document/index.ts",
    "    let timelineEvents: unknown[] = [];",
    "    let timelineEvents: TimelineEventCandidate[] = [];",
)

old_parser = '''      const parseAnalysisJson = (content: string) => {\n        const jsonMatch = content.match(/\\{[\\s\\S]*\\}/);\n        if (!jsonMatch) return null;\n        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;\n        return {\n          summary: String(parsed.summary || ''),\n          keyFacts: Array.isArray(parsed.key_facts) ? parsed.key_facts.map((i) => String(i)) : [],\n          favorableFindings: Array.isArray(parsed.favorable_findings) ? parsed.favorable_findings.map((i) => String(i)) : [],\n          adverseFindings: Array.isArray(parsed.adverse_findings) ? parsed.adverse_findings.map((i) => String(i)) : [],\n          actionItems: Array.isArray(parsed.action_items) ? parsed.action_items.map((i) => String(i)) : [],\n          timelineEvents: Array.isArray(parsed.timeline_events) ? (parsed.timeline_events as unknown[]) : [],\n          entities: Array.isArray(parsed.entities) ? parsed.entities : [],\n        };\n      };'''

new_parser = '''      const parseAnalysisJson = (content: string): StructuredChunkAnalysis | null => {\n        const jsonMatch = content.match(/\\{[\\s\\S]*\\}/);\n        if (!jsonMatch) return null;\n        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;\n        const rawTimelineEvents = Array.isArray(parsed.timeline_events) ? parsed.timeline_events : [];\n        const timelineEvents: TimelineEventCandidate[] = rawTimelineEvents.flatMap((item) => {\n          if (!item || typeof item !== 'object') return [];\n          const row = item as Record<string, unknown>;\n          return [{\n            date: typeof row.date === 'string' ? row.date : undefined,\n            event_title: typeof row.event_title === 'string' ? row.event_title : undefined,\n            description: typeof row.description === 'string' ? row.description : undefined,\n            importance: typeof row.importance === 'string' ? row.importance : undefined,\n            event_type: typeof row.event_type === 'string' ? row.event_type : undefined,\n            phase: typeof row.phase === 'string' ? row.phase : undefined,\n            next_required_action: typeof row.next_required_action === 'string' ? row.next_required_action : undefined,\n            entities: Array.isArray(row.entities) ? row.entities.map((entity) => String(entity)) : [],\n          }];\n        });\n        return {\n          summary: String(parsed.summary || ''),\n          keyFacts: Array.isArray(parsed.key_facts) ? parsed.key_facts.map((i) => String(i)) : [],\n          favorableFindings: Array.isArray(parsed.favorable_findings) ? parsed.favorable_findings.map((i) => String(i)) : [],\n          adverseFindings: Array.isArray(parsed.adverse_findings) ? parsed.adverse_findings.map((i) => String(i)) : [],\n          actionItems: Array.isArray(parsed.action_items) ? parsed.action_items.map((i) => String(i)) : [],\n          timelineEvents,\n          entities: Array.isArray(parsed.entities) ? parsed.entities : [],\n        };\n      };'''
replace_once("supabase/functions/ocr-document/index.ts", old_parser, new_parser)

print("Applied CaseBuddy CI repair round 2")
