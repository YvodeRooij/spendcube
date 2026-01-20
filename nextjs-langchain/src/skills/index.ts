/**
 * Skills Pattern Implementation
 *
 * Progressive disclosure of UNSPSC taxonomy based on record content.
 * Only loads relevant segments to reduce context and improve accuracy.
 */

import type { SpendRecord } from "@/types/records";

/**
 * Skill definition for a taxonomy segment
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  /** UNSPSC segment codes this skill covers (2-digit) */
  segments: string[];
  /** Keywords that trigger this skill */
  keywords: RegExp[];
  /** Priority for ordering (higher = more important) */
  priority: number;
  /** Whether this skill is always loaded */
  alwaysLoad?: boolean;
}

/**
 * Skill context loaded for classification
 */
export interface SkillContext {
  skillId: string;
  taxonomy: TaxonomyEntry[];
  examples: ClassificationExample[];
}

/**
 * Taxonomy entry (UNSPSC code)
 */
export interface TaxonomyEntry {
  code: string;
  title: string;
  segment: string;
  family: string;
  class?: string;
  commodity?: string;
  description?: string;
}

/**
 * Classification example for few-shot learning
 */
export interface ClassificationExample {
  input: {
    vendor: string;
    description: string;
  };
  output: {
    code: string;
    title: string;
    reasoning: string;
  };
}

/**
 * Skills Registry - Define all available skills
 */
export const SKILLS_REGISTRY: Skill[] = [
  {
    id: "it_hardware",
    name: "IT Hardware",
    description: "Computers, laptops, servers, networking equipment, peripherals",
    segments: ["43"],
    keywords: [
      /computer|laptop|desktop|server|workstation/i,
      /monitor|display|screen/i,
      /keyboard|mouse|webcam|headset/i,
      /router|switch|firewall|network/i,
      /printer|scanner|copier/i,
      /dell|hp|lenovo|apple|cisco|logitech/i,
    ],
    priority: 90,
  },
  {
    id: "it_software",
    name: "IT Software & Services",
    description: "Software licenses, subscriptions, cloud services, IT consulting",
    segments: ["43", "81"],
    keywords: [
      /software|license|subscription/i,
      /saas|cloud|azure|aws|gcp/i,
      /microsoft|adobe|salesforce|oracle|sap/i,
      /it\s+service|it\s+support|it\s+consulting/i,
      /cybersecurity|antivirus|backup/i,
    ],
    priority: 85,
  },
  {
    id: "office_supplies",
    name: "Office Supplies",
    description: "Paper, pens, staplers, folders, office equipment",
    segments: ["44"],
    keywords: [
      /paper|envelope|folder|binder/i,
      /pen|pencil|marker|highlighter/i,
      /stapler|tape|scissors|glue/i,
      /office\s+suppl/i,
      /staples|office\s*depot|amazon\s*business/i,
    ],
    priority: 80,
  },
  {
    id: "furniture",
    name: "Furniture & Fixtures",
    description: "Desks, chairs, storage, office furniture",
    segments: ["56"],
    keywords: [
      /desk|chair|table|cabinet/i,
      /furniture|ergonomic|standing\s+desk/i,
      /shelving|storage|filing/i,
      /herman\s*miller|steelcase|ikea/i,
    ],
    priority: 75,
  },
  {
    id: "professional_services",
    name: "Professional Services",
    description: "Legal, accounting, consulting, marketing services",
    segments: ["80", "81"],
    keywords: [
      /legal|attorney|law\s+firm/i,
      /accounting|audit|tax/i,
      /consulting|advisory|strategy/i,
      /marketing|advertising|pr|public\s+relation/i,
      /deloitte|kpmg|pwc|mckinsey|bcg/i,
    ],
    priority: 85,
  },
  {
    id: "facilities",
    name: "Facilities & Maintenance",
    description: "Janitorial, repairs, utilities, building services",
    segments: ["72", "76"],
    keywords: [
      /janitorial|cleaning|custodial/i,
      /maintenance|repair|hvac/i,
      /utility|electric|water|gas/i,
      /security|guard|alarm/i,
      /landscaping|pest\s+control/i,
    ],
    priority: 70,
  },
  {
    id: "travel",
    name: "Travel & Transportation",
    description: "Airfare, hotels, car rental, ground transportation",
    segments: ["78", "90"],
    keywords: [
      /travel|airfare|flight|airline/i,
      /hotel|lodging|accommodation/i,
      /car\s+rental|uber|lyft|taxi/i,
      /expense|per\s+diem/i,
      /american\s+airlines|united|delta|marriott|hilton/i,
    ],
    priority: 75,
  },
  {
    id: "hr_services",
    name: "HR & Staffing",
    description: "Recruiting, staffing, training, employee benefits",
    segments: ["80", "93"],
    keywords: [
      /recruiting|staffing|temp\s+agency/i,
      /training|learning|development/i,
      /payroll|benefits|hr\s+service/i,
      /background\s+check|drug\s+test/i,
      /adp|workday|linkedin/i,
    ],
    priority: 70,
  },
  {
    id: "telecommunications",
    name: "Telecommunications",
    description: "Phone services, mobile plans, internet connectivity",
    segments: ["43", "83"],
    keywords: [
      /telecom|telephone|phone/i,
      /mobile|cellular|wireless/i,
      /internet|broadband|fiber/i,
      /verizon|at&t|t-mobile|comcast/i,
    ],
    priority: 75,
  },
  {
    id: "raw_materials",
    name: "Raw Materials & MRO",
    description: "Industrial supplies, raw materials, maintenance supplies",
    segments: ["31", "39", "40"],
    keywords: [
      /raw\s+material|chemical|metal/i,
      /mro|maintenance.*repair.*operations/i,
      /industrial|manufacturing/i,
      /lubricant|adhesive|fastener/i,
      /grainger|fastenal|msc\s+industrial/i,
    ],
    priority: 65,
  },
];

/**
 * Detect relevant skills from a set of records
 */
export function detectRelevantSkills(records: SpendRecord[]): Skill[] {
  const skillScores = new Map<string, number>();

  // Score each skill based on keyword matches
  for (const record of records) {
    const searchText = `${record.vendor} ${record.description} ${record.department || ""}`.toLowerCase();

    for (const skill of SKILLS_REGISTRY) {
      let score = skillScores.get(skill.id) || 0;

      for (const keyword of skill.keywords) {
        if (keyword.test(searchText)) {
          score += skill.priority / 10;
        }
      }

      if (score > 0) {
        skillScores.set(skill.id, score);
      }
    }
  }

  // Get skills sorted by score
  const detectedSkills = SKILLS_REGISTRY
    .filter((skill) => skill.alwaysLoad || (skillScores.get(skill.id) || 0) > 0)
    .sort((a, b) => (skillScores.get(b.id) || 0) - (skillScores.get(a.id) || 0));

  // Return top 5 most relevant skills (or fewer if not enough detected)
  return detectedSkills.slice(0, 5);
}

/**
 * Get skills by segment codes
 */
export function getSkillsBySegments(segmentCodes: string[]): Skill[] {
  return SKILLS_REGISTRY.filter((skill) =>
    skill.segments.some((seg) => segmentCodes.includes(seg))
  );
}

/**
 * Get skill by ID
 */
export function getSkillById(skillId: string): Skill | undefined {
  return SKILLS_REGISTRY.find((skill) => skill.id === skillId);
}

/**
 * Get all unique segments covered by skills
 */
export function getAllCoveredSegments(): string[] {
  const segments = new Set<string>();
  for (const skill of SKILLS_REGISTRY) {
    for (const seg of skill.segments) {
      segments.add(seg);
    }
  }
  return Array.from(segments).sort();
}
