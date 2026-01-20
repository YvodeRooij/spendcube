/**
 * Skill Context Loaders
 *
 * Load taxonomy and examples for specific skills.
 * Uses lazy loading to minimize memory footprint.
 */

import type { Skill, SkillContext, TaxonomyEntry, ClassificationExample } from "./index";

/**
 * Cached skill contexts
 */
const skillContextCache = new Map<string, SkillContext>();

/**
 * IT Hardware Taxonomy (Segment 43)
 */
const IT_HARDWARE_TAXONOMY: TaxonomyEntry[] = [
  { code: "43211500", title: "Computers", segment: "Information Technology Broadcasting and Telecommunications", family: "Computer Equipment and Accessories" },
  { code: "43211501", title: "Desktop computers", segment: "Information Technology Broadcasting and Telecommunications", family: "Computer Equipment and Accessories" },
  { code: "43211502", title: "Notebook computers", segment: "Information Technology Broadcasting and Telecommunications", family: "Computer Equipment and Accessories" },
  { code: "43211503", title: "Personal digital assistants PDAs or organizers", segment: "Information Technology Broadcasting and Telecommunications", family: "Computer Equipment and Accessories" },
  { code: "43211507", title: "Tablet computers", segment: "Information Technology Broadcasting and Telecommunications", family: "Computer Equipment and Accessories" },
  { code: "43211508", title: "Thin client computers", segment: "Information Technology Broadcasting and Telecommunications", family: "Computer Equipment and Accessories" },
  { code: "43211509", title: "High end computer servers", segment: "Information Technology Broadcasting and Telecommunications", family: "Computer Equipment and Accessories" },
  { code: "43211600", title: "Computer displays", segment: "Information Technology Broadcasting and Telecommunications", family: "Computer Equipment and Accessories" },
  { code: "43211700", title: "Computer data input devices", segment: "Information Technology Broadcasting and Telecommunications", family: "Computer Equipment and Accessories" },
  { code: "43211701", title: "Computer keyboards", segment: "Information Technology Broadcasting and Telecommunications", family: "Computer Equipment and Accessories" },
  { code: "43211702", title: "Computer mouse or trackballs", segment: "Information Technology Broadcasting and Telecommunications", family: "Computer Equipment and Accessories" },
  { code: "43212100", title: "Computer printers", segment: "Information Technology Broadcasting and Telecommunications", family: "Computer Equipment and Accessories" },
  { code: "43222600", title: "Network switches", segment: "Information Technology Broadcasting and Telecommunications", family: "Data Voice or Multimedia Network Equipment" },
  { code: "43222609", title: "Network routers", segment: "Information Technology Broadcasting and Telecommunications", family: "Data Voice or Multimedia Network Equipment" },
];

const IT_HARDWARE_EXAMPLES: ClassificationExample[] = [
  {
    input: { vendor: "Dell Technologies", description: "Latitude 5520 Laptop Computer" },
    output: { code: "43211502", title: "Notebook computers", reasoning: "Dell Latitude is a business laptop product line, clearly a notebook computer" },
  },
  {
    input: { vendor: "Cisco Systems", description: "Catalyst 9200 Network Switch 24-port" },
    output: { code: "43222600", title: "Network switches", reasoning: "Cisco Catalyst is a network switch product line" },
  },
];

/**
 * Office Supplies Taxonomy (Segment 44)
 */
const OFFICE_SUPPLIES_TAXONOMY: TaxonomyEntry[] = [
  { code: "44111500", title: "Pens and pencils", segment: "Office Equipment and Accessories and Supplies", family: "Office supplies" },
  { code: "44111501", title: "Pencils", segment: "Office Equipment and Accessories and Supplies", family: "Office supplies" },
  { code: "44111503", title: "Pens", segment: "Office Equipment and Accessories and Supplies", family: "Office supplies" },
  { code: "44111505", title: "Markers", segment: "Office Equipment and Accessories and Supplies", family: "Office supplies" },
  { code: "44111800", title: "Correction supplies", segment: "Office Equipment and Accessories and Supplies", family: "Office supplies" },
  { code: "44111900", title: "Desk supplies", segment: "Office Equipment and Accessories and Supplies", family: "Office supplies" },
  { code: "44111912", title: "Staplers", segment: "Office Equipment and Accessories and Supplies", family: "Office supplies" },
  { code: "44112000", title: "Paper products", segment: "Office Equipment and Accessories and Supplies", family: "Office supplies" },
  { code: "44121500", title: "Adhesives and tapes", segment: "Office Equipment and Accessories and Supplies", family: "Office supplies" },
  { code: "44121600", title: "Binding and lamination supplies", segment: "Office Equipment and Accessories and Supplies", family: "Office supplies" },
  { code: "44121700", title: "Filing supplies", segment: "Office Equipment and Accessories and Supplies", family: "Office supplies" },
  { code: "44121701", title: "File folders", segment: "Office Equipment and Accessories and Supplies", family: "Office supplies" },
  { code: "44121702", title: "Binders", segment: "Office Equipment and Accessories and Supplies", family: "Office supplies" },
];

const OFFICE_SUPPLIES_EXAMPLES: ClassificationExample[] = [
  {
    input: { vendor: "Staples", description: "Copy Paper, 8.5x11, 10-ream case" },
    output: { code: "44112000", title: "Paper products", reasoning: "Standard copy paper is classified under paper products" },
  },
  {
    input: { vendor: "Amazon Business", description: "3-Ring Binders, 1 inch, 12-pack" },
    output: { code: "44121702", title: "Binders", reasoning: "Ring binders are classified under filing supplies - binders" },
  },
];

/**
 * Professional Services Taxonomy (Segments 80-81)
 */
const PROFESSIONAL_SERVICES_TAXONOMY: TaxonomyEntry[] = [
  { code: "80101500", title: "Business and corporate management consulting services", segment: "Management and Business Professionals and Administrative Services", family: "Management advisory services" },
  { code: "80101501", title: "Strategic planning consultation services", segment: "Management and Business Professionals and Administrative Services", family: "Management advisory services" },
  { code: "80101502", title: "Corporate mergers and acquisition services", segment: "Management and Business Professionals and Administrative Services", family: "Management advisory services" },
  { code: "80101504", title: "Business process reengineering services", segment: "Management and Business Professionals and Administrative Services", family: "Management advisory services" },
  { code: "80111500", title: "Human resources services", segment: "Management and Business Professionals and Administrative Services", family: "Human resources services" },
  { code: "80111501", title: "Personnel recruitment", segment: "Management and Business Professionals and Administrative Services", family: "Human resources services" },
  { code: "80111502", title: "Executive search services", segment: "Management and Business Professionals and Administrative Services", family: "Human resources services" },
  { code: "80121500", title: "Legal services", segment: "Management and Business Professionals and Administrative Services", family: "Legal services" },
  { code: "80121501", title: "Criminal law services", segment: "Management and Business Professionals and Administrative Services", family: "Legal services" },
  { code: "80121502", title: "Bankruptcy law services", segment: "Management and Business Professionals and Administrative Services", family: "Legal services" },
  { code: "80121600", title: "Legal review services", segment: "Management and Business Professionals and Administrative Services", family: "Legal services" },
  { code: "81111500", title: "Computer hardware maintenance and support", segment: "Engineering and Research and Technology Based Services", family: "Computer services" },
  { code: "81111800", title: "System and network administration services", segment: "Engineering and Research and Technology Based Services", family: "Computer services" },
  { code: "81112000", title: "Data services", segment: "Engineering and Research and Technology Based Services", family: "Computer services" },
  { code: "81112200", title: "Software or hardware engineering", segment: "Engineering and Research and Technology Based Services", family: "Computer services" },
];

const PROFESSIONAL_SERVICES_EXAMPLES: ClassificationExample[] = [
  {
    input: { vendor: "McKinsey & Company", description: "Strategic Planning Consultation Q4" },
    output: { code: "80101501", title: "Strategic planning consultation services", reasoning: "McKinsey provides management consulting, specifically strategic planning" },
  },
  {
    input: { vendor: "Robert Half", description: "IT Staff Augmentation Services" },
    output: { code: "80111501", title: "Personnel recruitment", reasoning: "Staffing services fall under personnel recruitment" },
  },
];

/**
 * Furniture Taxonomy (Segment 56)
 */
const FURNITURE_TAXONOMY: TaxonomyEntry[] = [
  { code: "56101500", title: "Office furniture", segment: "Furniture and Furnishings", family: "Accommodation furniture" },
  { code: "56101501", title: "Bookcases", segment: "Furniture and Furnishings", family: "Accommodation furniture" },
  { code: "56101503", title: "Desks", segment: "Furniture and Furnishings", family: "Accommodation furniture" },
  { code: "56101504", title: "Credenzas", segment: "Furniture and Furnishings", family: "Accommodation furniture" },
  { code: "56101505", title: "Storage cabinets or lockers", segment: "Furniture and Furnishings", family: "Accommodation furniture" },
  { code: "56101510", title: "Workstations", segment: "Furniture and Furnishings", family: "Accommodation furniture" },
  { code: "56101519", title: "Conference tables", segment: "Furniture and Furnishings", family: "Accommodation furniture" },
  { code: "56101800", title: "Seating", segment: "Furniture and Furnishings", family: "Accommodation furniture" },
  { code: "56101801", title: "Chairs", segment: "Furniture and Furnishings", family: "Accommodation furniture" },
  { code: "56101802", title: "Sofas", segment: "Furniture and Furnishings", family: "Accommodation furniture" },
];

const FURNITURE_EXAMPLES: ClassificationExample[] = [
  {
    input: { vendor: "Herman Miller", description: "Aeron Chair, Size B, Graphite" },
    output: { code: "56101801", title: "Chairs", reasoning: "Aeron is an office chair, classified under seating/chairs" },
  },
  {
    input: { vendor: "Steelcase", description: "Height Adjustable Standing Desk 60x30" },
    output: { code: "56101503", title: "Desks", reasoning: "Standing desk is classified under desks" },
  },
];

/**
 * Travel Taxonomy (Segments 78, 90)
 */
const TRAVEL_TAXONOMY: TaxonomyEntry[] = [
  { code: "78111500", title: "Air transportation", segment: "Transportation and Storage and Mail Services", family: "Passenger transport" },
  { code: "78111501", title: "Scheduled domestic passenger airline flights", segment: "Transportation and Storage and Mail Services", family: "Passenger transport" },
  { code: "78111502", title: "Scheduled international passenger airline flights", segment: "Transportation and Storage and Mail Services", family: "Passenger transport" },
  { code: "78111800", title: "Passenger ground transportation", segment: "Transportation and Storage and Mail Services", family: "Passenger transport" },
  { code: "78111801", title: "Taxi services", segment: "Transportation and Storage and Mail Services", family: "Passenger transport" },
  { code: "78111803", title: "Car rental services", segment: "Transportation and Storage and Mail Services", family: "Passenger transport" },
  { code: "90111500", title: "Hotels and motels", segment: "Travel and Food and Lodging and Entertainment Services", family: "Hotels and lodging and meeting facilities" },
  { code: "90111502", title: "Hotel or motel", segment: "Travel and Food and Lodging and Entertainment Services", family: "Hotels and lodging and meeting facilities" },
];

const TRAVEL_EXAMPLES: ClassificationExample[] = [
  {
    input: { vendor: "United Airlines", description: "SFO-JFK Round Trip Business Class" },
    output: { code: "78111502", title: "Scheduled international passenger airline flights", reasoning: "Commercial airline flight, likely domestic if US to US" },
  },
  {
    input: { vendor: "Marriott", description: "Hotel Stay - Chicago, IL, 3 nights" },
    output: { code: "90111502", title: "Hotel or motel", reasoning: "Hotel accommodation" },
  },
];

/**
 * Skill taxonomy and examples mapping
 */
const SKILL_DATA: Record<string, { taxonomy: TaxonomyEntry[]; examples: ClassificationExample[] }> = {
  it_hardware: { taxonomy: IT_HARDWARE_TAXONOMY, examples: IT_HARDWARE_EXAMPLES },
  it_software: { taxonomy: [...PROFESSIONAL_SERVICES_TAXONOMY.filter(t => t.code.startsWith("81"))], examples: [] },
  office_supplies: { taxonomy: OFFICE_SUPPLIES_TAXONOMY, examples: OFFICE_SUPPLIES_EXAMPLES },
  furniture: { taxonomy: FURNITURE_TAXONOMY, examples: FURNITURE_EXAMPLES },
  professional_services: { taxonomy: PROFESSIONAL_SERVICES_TAXONOMY, examples: PROFESSIONAL_SERVICES_EXAMPLES },
  travel: { taxonomy: TRAVEL_TAXONOMY, examples: TRAVEL_EXAMPLES },
  hr_services: { taxonomy: PROFESSIONAL_SERVICES_TAXONOMY.filter(t => t.code.startsWith("8011")), examples: [] },
  telecommunications: { taxonomy: IT_HARDWARE_TAXONOMY.filter(t => t.code.startsWith("4322")), examples: [] },
  facilities: { taxonomy: [], examples: [] },
  raw_materials: { taxonomy: [], examples: [] },
};

/**
 * Load skill context
 */
export function loadSkillContext(skill: Skill): SkillContext {
  // Check cache first
  const cached = skillContextCache.get(skill.id);
  if (cached) {
    return cached;
  }

  // Load from skill data
  const data = SKILL_DATA[skill.id] || { taxonomy: [], examples: [] };

  const context: SkillContext = {
    skillId: skill.id,
    taxonomy: data.taxonomy,
    examples: data.examples,
  };

  // Cache the result
  skillContextCache.set(skill.id, context);

  return context;
}

/**
 * Load contexts for multiple skills
 */
export function loadSkillContexts(skills: Skill[]): SkillContext[] {
  return skills.map((skill) => loadSkillContext(skill));
}

/**
 * Get combined taxonomy from multiple skill contexts
 */
export function getCombinedTaxonomy(contexts: SkillContext[]): TaxonomyEntry[] {
  const seen = new Set<string>();
  const combined: TaxonomyEntry[] = [];

  for (const context of contexts) {
    for (const entry of context.taxonomy) {
      if (!seen.has(entry.code)) {
        seen.add(entry.code);
        combined.push(entry);
      }
    }
  }

  return combined.sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Get combined examples from multiple skill contexts
 */
export function getCombinedExamples(contexts: SkillContext[], maxExamples: number = 10): ClassificationExample[] {
  const combined: ClassificationExample[] = [];

  for (const context of contexts) {
    for (const example of context.examples) {
      combined.push(example);
      if (combined.length >= maxExamples) {
        return combined;
      }
    }
  }

  return combined;
}

/**
 * Clear skill context cache
 */
export function clearSkillContextCache(): void {
  skillContextCache.clear();
}

/**
 * Format taxonomy for prompt injection
 */
export function formatTaxonomyForPrompt(taxonomy: TaxonomyEntry[]): string {
  if (taxonomy.length === 0) {
    return "No specific taxonomy loaded. Use general UNSPSC knowledge.";
  }

  const lines = taxonomy.map(
    (entry) => `${entry.code}: ${entry.title} (${entry.family})`
  );

  return lines.join("\n");
}

/**
 * Format examples for few-shot learning
 */
export function formatExamplesForPrompt(examples: ClassificationExample[]): string {
  if (examples.length === 0) {
    return "";
  }

  const formatted = examples.map((ex, i) => `
Example ${i + 1}:
Input: ${ex.input.vendor} - ${ex.input.description}
Output: ${ex.output.code} (${ex.output.title})
Reasoning: ${ex.output.reasoning}
`).join("\n");

  return `\n## Classification Examples\n${formatted}`;
}
