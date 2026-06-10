/**
 * Parse free-text nutrition messages into Nutrition Brain input.
 */

import type { NutritionBrainInput } from "../../ai/nutritionBrain"

const NAME_STOPWORDS = new Set([
  "poor",
  "appetite",
  "good",
  "reduced",
  "ate",
  "eat",
  "eating",
  "meal",
  "meals",
  "intake",
  "fluid",
  "fluids",
  "low",
  "high",
  "weak",
  "weakness",
  "vomit",
  "vomiting",
  "vomited",
  "diarrhea",
  "diarrhoea",
  "dry",
  "mouth",
  "weight",
  "loss",
  "urine",
  "output",
  "dehydrated",
  "dehydration",
  "not",
  "no",
  "nil",
])

function matchRoom(text: string): string | null {
  const m = /\b(?:room|rm|r)\s*\.?\s*([A-Za-z]?-?\d{1,4}[A-Za-z]?)\b/i.exec(text)
  return m ? m[1] : null
}

function takeNameTokens(tokens: string[]): string[] {
  const run: string[] = []
  for (const tok of tokens) {
    const low = tok.toLowerCase().replace(/[^a-z%]/g, "")
    if (!low || NAME_STOPWORDS.has(low)) break
    if (!/^[A-Za-z][A-Za-z'.-]*$/.test(tok)) break
    run.push(tok)
    if (run.length >= 4) break
  }
  return run
}

function matchPatientAfterRoom(text: string): string | null {
  const afterRoom = /\b(?:room|rm|r)\s*\.?\s*[A-Za-z]?-?\d{1,4}[A-Za-z]?\s+(.+)$/i.exec(text)
  if (!afterRoom) return null
  const run = takeNameTokens(afterRoom[1].split(/\s+/))
  if (!run.length) return null
  return run.map((tok) => tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase()).join(" ")
}

function matchAppetite(text: string): string | null {
  const t = String(text ?? "")
  if (/\bpoor\s+appetite\b/i.test(t)) return "poor appetite"
  if (/\breduced\s+(?:intake|appetite|oral\s+intake)\b/i.test(t)) return "reduced appetite"
  if (/\bnot\s+eating\b|\brefus(?:ing|ed)\s+food\b|\bminimal\s+intake\b/i.test(t)) return "poor appetite"
  if (/食欲不振|食慾不振|胃口差|没胃口|沒胃口/.test(t)) return "poor appetite"
  return null
}

function matchMealPercentage(text: string): string | number | null {
  const t = String(text ?? "")
  const ate =
    /\bate(?:n|s)?\s+(\d+(?:\.\d+)?)\s*%/i.exec(t) ||
    /\b(?:meal|food)\s+intake\s+(\d+(?:\.\d+)?)\s*%/i.exec(t) ||
    /\b(\d+(?:\.\d+)?)\s*%\s*(?:meal|food|intake|eaten|ate)\b/i.exec(t) ||
    /\bonly\s+(\d+(?:\.\d+)?)\s*%/i.exec(t)
  if (ate) return Number(ate[1])

  if (/\bless\s+than\s+25\b|\bunder\s+25\b|<\s*25\b/i.test(t)) return 20
  if (/\bless\s+than\s+50\b|\bunder\s+50\b|<\s*50\b/i.test(t)) return 40

  return null
}

function matchFluidIntake(text: string): string | null {
  const t = String(text ?? "")
  if (/\blow\s+fluid(?:\s+intake)?\b/i.test(t)) return "low"
  if (/\bpoor\s+fluid(?:\s+intake)?\b|\bminimal\s+fluid\b|\binsufficient\s+fluid\b/i.test(t)) return "low"
  if (/\bdehydrat(?:ed|ion)\b/i.test(t)) return "low"
  const ml = /\b(\d{2,4})\s*ml\b/i.exec(t)
  if (ml) return ml[1]
  return null
}

function matchUrineOutput(text: string): string | null {
  const t = String(text ?? "")
  if (/\b(?:no|nil|zero)\s+(?:urine|void|urination|output)\b/i.test(t)) return t.match(/\b(?:no|nil|zero)\s+(?:urine|void|urination|output)(?:\s+\d+\s*h(?:ours?|rs?)?)?\b/i)?.[0] ?? "no urine"
  if (/\b(?:no|without)\s+urine\s+\d+\s*h(?:ours?|rs?)?\b/i.test(t)) {
    const m = /\b(?:no|without)\s+urine\s+\d+\s*h(?:ours?|rs?)?\b/i.exec(t)
    return m ? m[0] : null
  }
  return null
}

function matchWeakness(text: string): boolean {
  return /\bweak(?:ness)?\b|\bgeneral(?:ized)?\s+weakness\b/i.test(String(text ?? "")) || /虚弱|乏力|无力/.test(String(text ?? ""))
}

function matchDryMouth(text: string): boolean {
  return /\bdry\s+mouth\b/i.test(String(text ?? "")) || /口干/.test(String(text ?? ""))
}

function matchVomiting(text: string): boolean {
  return /\bvomit(?:ed|ing)?\b/i.test(String(text ?? "")) || /呕吐/.test(String(text ?? ""))
}

function matchDiarrhea(text: string): boolean {
  return /\bdiarrh(?:ea|oea)\b|\bloose\s+stool\b/i.test(String(text ?? "")) || /腹泻|拉肚子/.test(String(text ?? ""))
}

function matchWeightLoss(text: string): boolean {
  return /\bweight\s+loss\b|\blosing\s+weight\b/i.test(String(text ?? ""))
}

export function isNutritionAssessmentText(text: string): boolean {
  const t = String(text ?? "").trim()
  if (!t) return false
  if (!matchRoom(t) && !matchPatientAfterRoom(t)) return false

  const nutritionCue =
    /\b(?:poor\s+appetite|reduced\s+(?:intake|appetite)|not\s+eating|refus(?:ing|ed)\s+food|ate(?:n|s)?\s+\d+|meal\s+intake|low\s+fluid|fluid\s+intake|dehydrat|vomit|diarrh|dry\s+mouth|weight\s+loss|no\s+urine|urine\s+output)\b/i.test(
      t,
    ) || /食欲不振|食慾不振|胃口差|口干|腹泻/.test(t)

  return nutritionCue
}

export function buildNutritionBrainInput(
  payload: NutritionBrainInput & { text?: string | null },
): NutritionBrainInput {
  const text = String(payload.text ?? "").trim()

  return {
    room: payload.room ?? (text ? matchRoom(text) : null),
    patientName: payload.patientName ?? (text ? matchPatientAfterRoom(text) : null),
    appetite: payload.appetite ?? (text ? matchAppetite(text) : null),
    fluidIntake: payload.fluidIntake ?? (text ? matchFluidIntake(text) : null),
    mealPercentage: payload.mealPercentage ?? (text ? matchMealPercentage(text) : null),
    weightLoss: payload.weightLoss ?? (text ? matchWeightLoss(text) : false),
    vomiting: payload.vomiting ?? (text ? matchVomiting(text) : false),
    diarrhea: payload.diarrhea ?? (text ? matchDiarrhea(text) : false),
    urineOutput: payload.urineOutput ?? (text ? matchUrineOutput(text) : null),
    dryMouth: payload.dryMouth ?? (text ? matchDryMouth(text) : false),
    weakness: payload.weakness ?? (text ? matchWeakness(text) : false),
  }
}
