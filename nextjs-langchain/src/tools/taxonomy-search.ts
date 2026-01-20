import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * UNSPSC Taxonomy Search Tool
 *
 * Searches the UNSPSC (United Nations Standard Products and Services Code)
 * taxonomy to find appropriate classification codes for spend records.
 *
 * Expanded implementation with comprehensive taxonomy coverage.
 */

/**
 * UNSPSC code result type
 */
export interface UNSPSCCode {
  code: string;
  title: string;
  segment: string;
  family: string;
  class: string;
  commodity: string;
  description?: string;
  keywords?: string[];
  score: number;
}

/**
 * Comprehensive UNSPSC taxonomy data
 * Organized by segment for efficient loading
 */
const TAXONOMY_DATA: UNSPSCCode[] = [
  // ===== SEGMENT 43: Information Technology =====
  { code: "43211500", title: "Computers", segment: "Information Technology", family: "Computer Equipment", class: "Computers", commodity: "Desktop computers", description: "Desktop and personal computers", keywords: ["computer", "pc", "desktop", "workstation"], score: 0 },
  { code: "43211501", title: "Desktop computers", segment: "Information Technology", family: "Computer Equipment", class: "Computers", commodity: "Desktop computers", description: "Desktop personal computers", keywords: ["desktop", "pc", "tower"], score: 0 },
  { code: "43211502", title: "Notebook computers", segment: "Information Technology", family: "Computer Equipment", class: "Computers", commodity: "Notebook computers", description: "Laptop and notebook computers", keywords: ["laptop", "notebook", "portable"], score: 0 },
  { code: "43211507", title: "Tablet computers", segment: "Information Technology", family: "Computer Equipment", class: "Computers", commodity: "Tablet computers", description: "Tablet and slate computers", keywords: ["tablet", "ipad", "surface"], score: 0 },
  { code: "43211509", title: "High end computer servers", segment: "Information Technology", family: "Computer Equipment", class: "Computers", commodity: "Servers", description: "Enterprise and high-end servers", keywords: ["server", "enterprise", "datacenter"], score: 0 },
  { code: "43211600", title: "Computer displays", segment: "Information Technology", family: "Computer Equipment", class: "Displays", commodity: "Monitors", description: "Computer monitors and displays", keywords: ["monitor", "display", "screen"], score: 0 },
  { code: "43211700", title: "Computer data input devices", segment: "Information Technology", family: "Computer Equipment", class: "Input devices", commodity: "Input devices", description: "Keyboards, mice, and input devices", keywords: ["keyboard", "mouse", "input"], score: 0 },
  { code: "43211701", title: "Computer keyboards", segment: "Information Technology", family: "Computer Equipment", class: "Input devices", commodity: "Keyboards", description: "Computer keyboards", keywords: ["keyboard", "typing"], score: 0 },
  { code: "43211702", title: "Computer mouse or trackballs", segment: "Information Technology", family: "Computer Equipment", class: "Input devices", commodity: "Mouse", description: "Mouse and pointing devices", keywords: ["mouse", "trackball", "trackpad"], score: 0 },
  { code: "43211800", title: "Computer data storage devices", segment: "Information Technology", family: "Computer Equipment", class: "Storage", commodity: "Storage devices", description: "Hard drives, SSDs, storage", keywords: ["storage", "ssd", "hard drive", "disk"], score: 0 },
  { code: "43212100", title: "Computer printers", segment: "Information Technology", family: "Computer Equipment", class: "Printers", commodity: "Printers", description: "Computer printers and MFPs", keywords: ["printer", "printing", "mfp"], score: 0 },
  { code: "43222600", title: "Network switches", segment: "Information Technology", family: "Network Equipment", class: "Switches", commodity: "Network switches", description: "Network switches and hubs", keywords: ["switch", "network", "hub", "ethernet"], score: 0 },
  { code: "43222609", title: "Network routers", segment: "Information Technology", family: "Network Equipment", class: "Routers", commodity: "Routers", description: "Network routers", keywords: ["router", "routing", "network"], score: 0 },
  { code: "43222700", title: "Network security equipment", segment: "Information Technology", family: "Network Equipment", class: "Security", commodity: "Firewalls", description: "Firewalls and network security", keywords: ["firewall", "security", "vpn"], score: 0 },
  { code: "43231500", title: "Business function software", segment: "Information Technology", family: "Software", class: "Business software", commodity: "Business applications", description: "Business application software", keywords: ["software", "application", "business"], score: 0 },
  { code: "43231501", title: "Enterprise resource planning software", segment: "Information Technology", family: "Software", class: "Business software", commodity: "ERP", description: "ERP systems like SAP, Oracle", keywords: ["erp", "sap", "oracle", "enterprise"], score: 0 },
  { code: "43231503", title: "Customer relationship management software", segment: "Information Technology", family: "Software", class: "Business software", commodity: "CRM", description: "CRM software like Salesforce", keywords: ["crm", "salesforce", "customer"], score: 0 },
  { code: "43231512", title: "Database software", segment: "Information Technology", family: "Software", class: "Database", commodity: "Database", description: "Database management software", keywords: ["database", "sql", "oracle"], score: 0 },
  { code: "43232100", title: "Network management software", segment: "Information Technology", family: "Software", class: "Network software", commodity: "Network management", description: "Network monitoring and management", keywords: ["network", "monitoring", "management"], score: 0 },
  { code: "43232300", title: "Security software", segment: "Information Technology", family: "Software", class: "Security software", commodity: "Security", description: "Antivirus, security software", keywords: ["antivirus", "security", "malware", "protection"], score: 0 },

  // ===== SEGMENT 44: Office Equipment and Supplies =====
  { code: "44101500", title: "Calculators", segment: "Office Equipment", family: "Office machines", class: "Calculators", commodity: "Calculators", description: "Desktop and handheld calculators", keywords: ["calculator", "calculating"], score: 0 },
  { code: "44101700", title: "Duplicating machines", segment: "Office Equipment", family: "Office machines", class: "Copiers", commodity: "Copiers", description: "Photocopiers and duplicators", keywords: ["copier", "photocopier", "xerox"], score: 0 },
  { code: "44111500", title: "Pens and pencils", segment: "Office Equipment", family: "Office supplies", class: "Writing instruments", commodity: "Pens", description: "Pens, pencils, markers", keywords: ["pen", "pencil", "marker", "highlighter"], score: 0 },
  { code: "44111800", title: "Correction supplies", segment: "Office Equipment", family: "Office supplies", class: "Correction", commodity: "Correction fluid", description: "Correction tape and fluid", keywords: ["correction", "whiteout"], score: 0 },
  { code: "44111900", title: "Desk supplies", segment: "Office Equipment", family: "Office supplies", class: "Desk accessories", commodity: "Desk supplies", description: "Staplers, tape, desk accessories", keywords: ["stapler", "tape", "clips", "desk"], score: 0 },
  { code: "44112000", title: "Paper products", segment: "Office Equipment", family: "Office supplies", class: "Paper", commodity: "Paper", description: "Copy paper, notebooks, pads", keywords: ["paper", "copy", "notebook", "pad"], score: 0 },
  { code: "44121500", title: "Adhesives and tapes", segment: "Office Equipment", family: "Office supplies", class: "Adhesives", commodity: "Tape", description: "Office tapes and adhesives", keywords: ["tape", "adhesive", "glue"], score: 0 },
  { code: "44121600", title: "Binding and lamination supplies", segment: "Office Equipment", family: "Office supplies", class: "Binding", commodity: "Binding", description: "Binding materials and laminators", keywords: ["binding", "lamination", "covers"], score: 0 },
  { code: "44121700", title: "Filing supplies", segment: "Office Equipment", family: "Office supplies", class: "Filing", commodity: "File folders", description: "Folders, binders, filing supplies", keywords: ["folder", "binder", "filing", "organizer"], score: 0 },

  // ===== SEGMENT 56: Furniture =====
  { code: "56101500", title: "Office furniture", segment: "Furniture", family: "Accommodation furniture", class: "Office furniture", commodity: "Office furniture", description: "General office furniture", keywords: ["furniture", "office"], score: 0 },
  { code: "56101503", title: "Desks", segment: "Furniture", family: "Accommodation furniture", class: "Office furniture", commodity: "Desks", description: "Office desks and workstations", keywords: ["desk", "workstation", "standing desk"], score: 0 },
  { code: "56101504", title: "Credenzas", segment: "Furniture", family: "Accommodation furniture", class: "Office furniture", commodity: "Credenzas", description: "Storage credenzas", keywords: ["credenza", "storage"], score: 0 },
  { code: "56101505", title: "Storage cabinets", segment: "Furniture", family: "Accommodation furniture", class: "Office furniture", commodity: "Cabinets", description: "Storage cabinets and lockers", keywords: ["cabinet", "locker", "storage"], score: 0 },
  { code: "56101519", title: "Conference tables", segment: "Furniture", family: "Accommodation furniture", class: "Office furniture", commodity: "Tables", description: "Conference and meeting tables", keywords: ["conference", "table", "meeting"], score: 0 },
  { code: "56101800", title: "Seating", segment: "Furniture", family: "Accommodation furniture", class: "Seating", commodity: "Seating", description: "Office seating and chairs", keywords: ["chair", "seating", "ergonomic"], score: 0 },
  { code: "56101801", title: "Chairs", segment: "Furniture", family: "Accommodation furniture", class: "Seating", commodity: "Chairs", description: "Office chairs", keywords: ["chair", "task chair", "office chair"], score: 0 },
  { code: "56112100", title: "Cubicles and panel systems", segment: "Furniture", family: "Office furniture", class: "Panels", commodity: "Cubicles", description: "Office partitions and cubicles", keywords: ["cubicle", "partition", "panel"], score: 0 },

  // ===== SEGMENT 72: Building and Facilities =====
  { code: "72101500", title: "Building construction services", segment: "Building and Construction", family: "Construction services", class: "Building construction", commodity: "Construction", description: "General construction services", keywords: ["construction", "building"], score: 0 },
  { code: "72102100", title: "Electrical system installation", segment: "Building and Construction", family: "Construction services", class: "Electrical", commodity: "Electrical installation", description: "Electrical work and installation", keywords: ["electrical", "wiring", "installation"], score: 0 },
  { code: "72102200", title: "Plumbing system installation", segment: "Building and Construction", family: "Construction services", class: "Plumbing", commodity: "Plumbing", description: "Plumbing installation and repair", keywords: ["plumbing", "pipes", "water"], score: 0 },
  { code: "72102300", title: "HVAC system installation", segment: "Building and Construction", family: "Construction services", class: "HVAC", commodity: "HVAC", description: "Heating and cooling systems", keywords: ["hvac", "heating", "cooling", "air conditioning"], score: 0 },
  { code: "72151500", title: "Painting services", segment: "Building and Construction", family: "Maintenance services", class: "Painting", commodity: "Painting", description: "Commercial painting services", keywords: ["painting", "paint"], score: 0 },

  // ===== SEGMENT 76: Industrial Cleaning =====
  { code: "76111500", title: "Cleaning services", segment: "Industrial Cleaning", family: "Cleaning services", class: "General cleaning", commodity: "Cleaning", description: "Building and facility cleaning", keywords: ["cleaning", "janitorial", "custodial"], score: 0 },
  { code: "76111501", title: "Restroom cleaning services", segment: "Industrial Cleaning", family: "Cleaning services", class: "General cleaning", commodity: "Restroom cleaning", description: "Restroom sanitation", keywords: ["restroom", "bathroom", "sanitation"], score: 0 },
  { code: "76111502", title: "Floor cleaning services", segment: "Industrial Cleaning", family: "Cleaning services", class: "General cleaning", commodity: "Floor cleaning", description: "Floor care and maintenance", keywords: ["floor", "carpet", "polishing"], score: 0 },
  { code: "76111600", title: "Refuse disposal and treatment", segment: "Industrial Cleaning", family: "Cleaning services", class: "Waste management", commodity: "Waste disposal", description: "Trash removal and recycling", keywords: ["waste", "trash", "recycling", "disposal"], score: 0 },
  { code: "76121500", title: "Pest control services", segment: "Industrial Cleaning", family: "Pest control", class: "Pest control", commodity: "Extermination", description: "Pest control and extermination", keywords: ["pest", "exterminator", "rodent", "insect"], score: 0 },

  // ===== SEGMENT 78: Transportation =====
  { code: "78101500", title: "Freight transport", segment: "Transportation", family: "Freight transport", class: "Freight", commodity: "Shipping", description: "Freight and cargo shipping", keywords: ["freight", "shipping", "cargo"], score: 0 },
  { code: "78101800", title: "Courier services", segment: "Transportation", family: "Freight transport", class: "Courier", commodity: "Courier", description: "Courier and express delivery", keywords: ["courier", "express", "delivery", "fedex", "ups"], score: 0 },
  { code: "78111500", title: "Air transportation", segment: "Transportation", family: "Passenger transport", class: "Air transport", commodity: "Air travel", description: "Commercial air travel", keywords: ["air", "flight", "airline", "travel"], score: 0 },
  { code: "78111800", title: "Ground transportation", segment: "Transportation", family: "Passenger transport", class: "Ground transport", commodity: "Ground transport", description: "Taxi, car service, ground transport", keywords: ["taxi", "uber", "lyft", "car service"], score: 0 },
  { code: "78111803", title: "Car rental services", segment: "Transportation", family: "Passenger transport", class: "Car rental", commodity: "Car rental", description: "Vehicle rental services", keywords: ["rental", "car rental", "vehicle", "hertz", "enterprise"], score: 0 },

  // ===== SEGMENT 80: Management Services =====
  { code: "80101500", title: "Business consulting services", segment: "Management Services", family: "Management consulting", class: "Business consulting", commodity: "Consulting", description: "Business and management consulting", keywords: ["consulting", "advisory", "strategy", "mckinsey", "bcg"], score: 0 },
  { code: "80101501", title: "Strategic planning consultation", segment: "Management Services", family: "Management consulting", class: "Strategic consulting", commodity: "Strategic planning", description: "Strategic planning and advisory", keywords: ["strategic", "strategy", "planning"], score: 0 },
  { code: "80101504", title: "Business process reengineering", segment: "Management Services", family: "Management consulting", class: "Process consulting", commodity: "BPR", description: "Process improvement consulting", keywords: ["process", "reengineering", "improvement"], score: 0 },
  { code: "80111500", title: "Human resources services", segment: "Management Services", family: "HR services", class: "HR services", commodity: "HR", description: "HR consulting and services", keywords: ["hr", "human resources", "personnel"], score: 0 },
  { code: "80111501", title: "Personnel recruitment", segment: "Management Services", family: "HR services", class: "Recruitment", commodity: "Recruiting", description: "Recruiting and staffing services", keywords: ["recruiting", "staffing", "hiring", "talent"], score: 0 },
  { code: "80111502", title: "Executive search services", segment: "Management Services", family: "HR services", class: "Executive search", commodity: "Executive search", description: "Executive and leadership recruiting", keywords: ["executive", "search", "headhunter"], score: 0 },
  { code: "80111600", title: "Temporary personnel services", segment: "Management Services", family: "HR services", class: "Temporary staffing", commodity: "Temp staffing", description: "Temporary and contract staffing", keywords: ["temporary", "temp", "contract", "staffing"], score: 0 },
  { code: "80121500", title: "Legal services", segment: "Management Services", family: "Legal services", class: "Legal", commodity: "Legal services", description: "Legal counsel and services", keywords: ["legal", "attorney", "lawyer", "law firm"], score: 0 },
  { code: "80121600", title: "Legal review services", segment: "Management Services", family: "Legal services", class: "Legal review", commodity: "Document review", description: "Legal document review", keywords: ["legal review", "document", "contract review"], score: 0 },
  { code: "80131500", title: "Real estate services", segment: "Management Services", family: "Real estate", class: "Real estate", commodity: "Real estate", description: "Commercial real estate services", keywords: ["real estate", "property", "leasing"], score: 0 },
  { code: "80141500", title: "Market research", segment: "Management Services", family: "Market research", class: "Research", commodity: "Market research", description: "Market research and analysis", keywords: ["market research", "survey", "analysis"], score: 0 },

  // ===== SEGMENT 81: Engineering Services =====
  { code: "81101500", title: "Civil engineering", segment: "Engineering Services", family: "Engineering", class: "Civil engineering", commodity: "Civil engineering", description: "Civil engineering services", keywords: ["civil", "engineering", "structural"], score: 0 },
  { code: "81101600", title: "Mechanical engineering", segment: "Engineering Services", family: "Engineering", class: "Mechanical engineering", commodity: "Mechanical engineering", description: "Mechanical engineering services", keywords: ["mechanical", "engineering"], score: 0 },
  { code: "81101700", title: "Electrical engineering", segment: "Engineering Services", family: "Engineering", class: "Electrical engineering", commodity: "Electrical engineering", description: "Electrical and electronic engineering", keywords: ["electrical", "electronic", "engineering"], score: 0 },
  { code: "81111500", title: "Computer hardware maintenance", segment: "Engineering Services", family: "Computer services", class: "Hardware support", commodity: "Hardware maintenance", description: "Computer hardware support", keywords: ["hardware", "maintenance", "support", "repair"], score: 0 },
  { code: "81111800", title: "System administration services", segment: "Engineering Services", family: "Computer services", class: "IT services", commodity: "System admin", description: "IT system administration", keywords: ["system admin", "it support", "administration"], score: 0 },
  { code: "81112000", title: "Data services", segment: "Engineering Services", family: "Computer services", class: "Data services", commodity: "Data management", description: "Data management and processing", keywords: ["data", "database", "processing"], score: 0 },
  { code: "81112200", title: "Software maintenance", segment: "Engineering Services", family: "Computer services", class: "Software support", commodity: "Software maintenance", description: "Software maintenance and support", keywords: ["software", "maintenance", "support", "license"], score: 0 },

  // ===== SEGMENT 82: Editorial Services =====
  { code: "82101500", title: "Advertising agency services", segment: "Editorial Services", family: "Advertising", class: "Advertising", commodity: "Agency services", description: "Advertising and creative agency", keywords: ["advertising", "agency", "creative", "marketing"], score: 0 },
  { code: "82101600", title: "Graphic design", segment: "Editorial Services", family: "Design services", class: "Graphic design", commodity: "Design", description: "Graphic design services", keywords: ["graphic", "design", "creative"], score: 0 },
  { code: "82111800", title: "Writing services", segment: "Editorial Services", family: "Writing", class: "Writing", commodity: "Content writing", description: "Content and copywriting", keywords: ["writing", "content", "copywriting"], score: 0 },
  { code: "82121500", title: "Printing services", segment: "Editorial Services", family: "Printing", class: "Printing", commodity: "Commercial printing", description: "Commercial printing", keywords: ["printing", "print", "reproduction"], score: 0 },
  { code: "82121600", title: "Bookbinding services", segment: "Editorial Services", family: "Printing", class: "Binding", commodity: "Bookbinding", description: "Bookbinding and finishing", keywords: ["binding", "bookbinding"], score: 0 },

  // ===== SEGMENT 83: Utilities =====
  { code: "83101500", title: "Electric utility services", segment: "Utilities", family: "Utility services", class: "Electric", commodity: "Electricity", description: "Electric power services", keywords: ["electric", "electricity", "power", "utility"], score: 0 },
  { code: "83101600", title: "Natural gas distribution", segment: "Utilities", family: "Utility services", class: "Gas", commodity: "Natural gas", description: "Natural gas services", keywords: ["gas", "natural gas", "utility"], score: 0 },
  { code: "83101800", title: "Water utility services", segment: "Utilities", family: "Utility services", class: "Water", commodity: "Water", description: "Water supply services", keywords: ["water", "utility", "municipal"], score: 0 },
  { code: "83111500", title: "Telecommunications services", segment: "Utilities", family: "Telecommunications", class: "Telecom", commodity: "Telecom", description: "Telephone and telecom services", keywords: ["telecom", "telephone", "phone", "communications"], score: 0 },
  { code: "83111600", title: "Mobile communications", segment: "Utilities", family: "Telecommunications", class: "Mobile", commodity: "Mobile services", description: "Mobile phone services", keywords: ["mobile", "cellular", "wireless", "cell phone"], score: 0 },
  { code: "83111800", title: "Internet service providers", segment: "Utilities", family: "Telecommunications", class: "Internet", commodity: "ISP", description: "Internet connectivity services", keywords: ["internet", "isp", "broadband", "connectivity"], score: 0 },

  // ===== SEGMENT 84: Financial Services =====
  { code: "84111500", title: "Accounting services", segment: "Financial Services", family: "Accounting", class: "Accounting", commodity: "Accounting", description: "Accounting and bookkeeping", keywords: ["accounting", "bookkeeping", "cpa"], score: 0 },
  { code: "84111501", title: "Financial auditing services", segment: "Financial Services", family: "Accounting", class: "Auditing", commodity: "Audit", description: "Financial audit services", keywords: ["audit", "auditing", "financial"], score: 0 },
  { code: "84111502", title: "Tax preparation services", segment: "Financial Services", family: "Accounting", class: "Tax", commodity: "Tax preparation", description: "Tax preparation and filing", keywords: ["tax", "taxation", "tax preparation"], score: 0 },
  { code: "84121500", title: "Insurance services", segment: "Financial Services", family: "Insurance", class: "Insurance", commodity: "Insurance", description: "Business insurance services", keywords: ["insurance", "coverage", "policy"], score: 0 },
  { code: "84121700", title: "Health insurance", segment: "Financial Services", family: "Insurance", class: "Health insurance", commodity: "Health insurance", description: "Employee health insurance", keywords: ["health insurance", "medical", "healthcare"], score: 0 },
  { code: "84131500", title: "Banking services", segment: "Financial Services", family: "Banking", class: "Banking", commodity: "Banking", description: "Commercial banking services", keywords: ["banking", "bank", "financial"], score: 0 },

  // ===== SEGMENT 85: Healthcare Services =====
  { code: "85101500", title: "Healthcare administration", segment: "Healthcare", family: "Healthcare services", class: "Administration", commodity: "Healthcare admin", description: "Healthcare administration", keywords: ["healthcare", "medical", "administration"], score: 0 },
  { code: "85111600", title: "Occupational health services", segment: "Healthcare", family: "Healthcare services", class: "Occupational health", commodity: "Occupational health", description: "Workplace health services", keywords: ["occupational", "health", "workplace", "safety"], score: 0 },
  { code: "85121800", title: "Pharmaceutical services", segment: "Healthcare", family: "Healthcare services", class: "Pharmacy", commodity: "Pharmacy", description: "Pharmacy and pharmaceutical", keywords: ["pharmacy", "pharmaceutical", "prescription"], score: 0 },

  // ===== SEGMENT 86: Education Services =====
  { code: "86101700", title: "Employee training", segment: "Education", family: "Education services", class: "Corporate training", commodity: "Training", description: "Corporate training services", keywords: ["training", "learning", "development", "education"], score: 0 },
  { code: "86101800", title: "Computer based training", segment: "Education", family: "Education services", class: "E-learning", commodity: "E-learning", description: "Online and computer training", keywords: ["elearning", "online", "computer based", "lms"], score: 0 },
  { code: "86111600", title: "Professional certification", segment: "Education", family: "Education services", class: "Certification", commodity: "Certification", description: "Professional certifications", keywords: ["certification", "certificate", "professional"], score: 0 },

  // ===== SEGMENT 90: Travel and Hospitality =====
  { code: "90101500", title: "Food and beverage services", segment: "Travel and Food", family: "Food services", class: "Catering", commodity: "Catering", description: "Catering and food services", keywords: ["catering", "food", "beverage", "meals"], score: 0 },
  { code: "90101600", title: "Restaurant services", segment: "Travel and Food", family: "Food services", class: "Restaurant", commodity: "Dining", description: "Restaurant and dining", keywords: ["restaurant", "dining", "meals"], score: 0 },
  { code: "90111500", title: "Hotels and motels", segment: "Travel and Food", family: "Lodging", class: "Hotels", commodity: "Hotel accommodation", description: "Hotel and motel lodging", keywords: ["hotel", "motel", "lodging", "accommodation", "marriott", "hilton"], score: 0 },
  { code: "90111600", title: "Meeting facilities", segment: "Travel and Food", family: "Lodging", class: "Meetings", commodity: "Conference facilities", description: "Meeting and conference rooms", keywords: ["meeting", "conference", "room", "venue"], score: 0 },
  { code: "90121500", title: "Travel agency services", segment: "Travel and Food", family: "Travel services", class: "Travel agency", commodity: "Travel booking", description: "Travel booking and agency", keywords: ["travel", "booking", "agency", "trip"], score: 0 },
  { code: "90121600", title: "Event management", segment: "Travel and Food", family: "Travel services", class: "Events", commodity: "Event planning", description: "Event planning and management", keywords: ["event", "conference", "meeting", "planning"], score: 0 },

  // ===== SEGMENT 92: National Defense and Security =====
  { code: "92121500", title: "Security guard services", segment: "Defense and Security", family: "Security services", class: "Guard services", commodity: "Security guards", description: "Security guard services", keywords: ["security", "guard", "protection"], score: 0 },
  { code: "92121700", title: "Surveillance services", segment: "Defense and Security", family: "Security services", class: "Surveillance", commodity: "Surveillance", description: "Security monitoring", keywords: ["surveillance", "monitoring", "cctv", "camera"], score: 0 },

  // ===== SEGMENT 93: Politics and Civic Affairs =====
  { code: "93131600", title: "Trade association services", segment: "Politics and Civic", family: "Associations", class: "Trade associations", commodity: "Membership", description: "Industry associations and memberships", keywords: ["association", "membership", "trade"], score: 0 },
];

/**
 * Enhanced text similarity scoring with keyword matching
 */
function calculateSimilarity(query: string, code: UNSPSCCode): number {
  const queryWords = query.toLowerCase().split(/\s+/);
  const queryLower = query.toLowerCase();

  let score = 0;

  // Title match (highest weight)
  const titleLower = code.title.toLowerCase();
  for (const word of queryWords) {
    if (titleLower.includes(word)) score += 0.15;
  }
  if (titleLower.includes(queryLower)) score += 0.2;

  // Keyword match (high weight)
  if (code.keywords) {
    for (const keyword of code.keywords) {
      if (queryLower.includes(keyword)) score += 0.12;
      for (const word of queryWords) {
        if (keyword.includes(word) || word.includes(keyword)) score += 0.08;
      }
    }
  }

  // Description match
  const descLower = (code.description || "").toLowerCase();
  for (const word of queryWords) {
    if (word.length > 2 && descLower.includes(word)) score += 0.05;
  }

  // Commodity match
  const commodityLower = code.commodity.toLowerCase();
  for (const word of queryWords) {
    if (commodityLower.includes(word)) score += 0.08;
  }

  // Family/class match
  const familyLower = code.family.toLowerCase();
  const classLower = code.class.toLowerCase();
  for (const word of queryWords) {
    if (familyLower.includes(word)) score += 0.05;
    if (classLower.includes(word)) score += 0.05;
  }

  return Math.min(score, 1.0);
}

/**
 * Search the UNSPSC taxonomy
 */
async function searchTaxonomy(
  query: string,
  limit: number = 5
): Promise<UNSPSCCode[]> {
  // Score each code based on query similarity
  const scoredCodes = TAXONOMY_DATA.map((code) => ({
    ...code,
    score: calculateSimilarity(query, code),
  }));

  // Sort by score and return top results
  return scoredCodes
    .filter((code) => code.score > 0.1) // Minimum threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * LangChain tool for taxonomy search
 */
export const taxonomySearchTool = tool(
  async (input: { query: string; limit?: number }) => {
    const results = await searchTaxonomy(input.query, input.limit || 5);

    if (results.length === 0) {
      return JSON.stringify({
        success: false,
        message: "No matching UNSPSC codes found for the query",
        query: input.query,
        results: [],
      });
    }

    return JSON.stringify({
      success: true,
      query: input.query,
      resultCount: results.length,
      results: results.map((r) => ({
        code: r.code,
        title: r.title,
        segment: r.segment,
        family: r.family,
        class: r.class,
        commodity: r.commodity,
        confidence: Math.round(r.score * 100),
      })),
    });
  },
  {
    name: "taxonomy_search",
    description:
      "Search the UNSPSC taxonomy to find classification codes for spend records. " +
      "Use this tool when you need to classify purchases, invoices, or procurement items. " +
      "Provide a description of the item or service to find matching UNSPSC codes.",
    schema: z.object({
      query: z
        .string()
        .describe(
          "The search query describing the item or service to classify"
        ),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of results to return (default: 5)"),
    }),
  }
);

/**
 * Get a specific UNSPSC code by its code value
 */
export const getCodeTool = tool(
  async (input: { code: string }) => {
    const found = TAXONOMY_DATA.find((c) => c.code === input.code);

    if (!found) {
      return JSON.stringify({
        success: false,
        message: `UNSPSC code ${input.code} not found`,
      });
    }

    return JSON.stringify({
      success: true,
      code: found,
    });
  },
  {
    name: "get_unspsc_code",
    description:
      "Retrieve details for a specific UNSPSC code. Use this to get the full hierarchy " +
      "and description for a known classification code.",
    schema: z.object({
      code: z.string().describe("The 8-digit UNSPSC code to look up"),
    }),
  }
);

/**
 * Get all codes for a segment
 */
export function getCodesBySegment(segment: string): UNSPSCCode[] {
  return TAXONOMY_DATA.filter(
    (code) => code.segment.toLowerCase().includes(segment.toLowerCase())
  );
}

/**
 * Get taxonomy statistics
 */
export function getTaxonomyStats(): {
  totalCodes: number;
  segments: string[];
  families: string[];
} {
  const segments = [...new Set(TAXONOMY_DATA.map((c) => c.segment))];
  const families = [...new Set(TAXONOMY_DATA.map((c) => c.family))];

  return {
    totalCodes: TAXONOMY_DATA.length,
    segments,
    families,
  };
}
