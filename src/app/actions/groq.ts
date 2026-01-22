"use server";

import Groq from "groq-sdk";
import { COACHING_KNOWLEDGE, REALITY_CHECK_RULES } from "@/lib/coaching-knowledge";

function getGroqKeys(): string[] {
    const keys = process.env.GROQ_API_KEYS ? process.env.GROQ_API_KEYS.split(",").map(k => k.trim()) : [];
    if (keys.length === 0 && process.env.GROQ_API_KEY) {
        keys.push(process.env.GROQ_API_KEY);
    }
    return keys;
}

export interface UserStats {
    height: number;
    weight: number;
    age: number;
    best5kTime: string;
    goal: "beginner" | "intermediate" | "elite";
    targetDistance: "5km" | "10km" | "Half Marathon" | "Full Marathon";
    targetTime?: string;
}

// --- PACING HELPERS ---

function parseTimeStringToSeconds(timeStr: string): number | null {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return parts[0] * 60; // Minutes fallback
}

function formatSecondsToPace(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}/km`;
}

function calculatePace(timeStr: string, distKm: number): string {
    const totalSeconds = parseTimeStringToSeconds(timeStr);
    if (!totalSeconds) return "Unknown";
    return formatSecondsToPace(totalSeconds / distKm);
}

function getDistanceKm(dist: string): number {
    if (dist === "10km") return 10;
    if (dist === "Half Marathon") return 21.1;
    if (dist === "Full Marathon") return 42.2;
    return 5;
}

function getPaceRanges(best5k: string) {
    const totalSeconds = parseTimeStringToSeconds(best5k) || 1200;
    const pbSecondsPerKm = totalSeconds / 5;
    const clampPace = (s: number) => Math.min(s, 570); // 9:30/km max

    return {
        easyRange: `${formatSecondsToPace(clampPace(pbSecondsPerKm * 1.35))} - ${formatSecondsToPace(clampPace(pbSecondsPerKm * 1.55))}`,
        tempoRange: `${formatSecondsToPace(clampPace(pbSecondsPerKm * 1.15))} - ${formatSecondsToPace(clampPace(pbSecondsPerKm * 1.25))}`,
        intervalPace: formatSecondsToPace(Math.max(pbSecondsPerKm, 300)),
        hillsPace: formatSecondsToPace(clampPace(pbSecondsPerKm * 1.2)),
        stridesPace: "90-95% Effort (Mile Pace)"
    };
}

// --- SERVER ACTIONS ---

/**
 * STEP 1: Discover 3 distinct training plan strategies.
 */
export async function generatePlanOptionsAction(stats: UserStats) {
    const currentPbPace = calculatePace(stats.best5kTime, 5);
    const { easyRange } = getPaceRanges(stats.best5kTime);

    let realityCheckNote = "";
    if (stats.targetTime) {
        const goalPaceSec = parseTimeStringToSeconds(stats.targetTime)! / getDistanceKm(stats.targetDistance);
        const pbPaceSec = parseTimeStringToSeconds(stats.best5kTime)! / 5;
        if (goalPaceSec < pbPaceSec) {
            realityCheckNote = "WARNING: Goal pace is faster than current 5k PB. Plan will be extended to 18 weeks.";
        }
    }

    const distanceKey = stats.targetDistance as keyof typeof COACHING_KNOWLEDGE;
    const expertKnowledge = COACHING_KNOWLEDGE[distanceKey] || COACHING_KNOWLEDGE["5km"];

    const prompt = `
    TASK: Generate 3 DISTINCT training strategies for ${stats.targetDistance}.
    
    USER PROFILE:
    - 5km PB: ${stats.best5kTime} (Pace: ${currentPbPace})
    - Goal: ${stats.targetDistance} ${stats.targetTime ? `(Target: ${stats.targetTime})` : ""}
    - Level: ${stats.goal}
    
    EXPERT CONTEXT:
    ${expertKnowledge}
    ${realityCheckNote}

    Return a JSON object with 3 options:
    - id: "steady" | "performance" | "health"
    - title: Strategic Name
    - strategy_summary: EXACTLY 2 sentences on the methodology.
    - coach_notes: 1 sentence on focus.
    - total_weeks: ${realityCheckNote ? 18 : 12}
    - target_peak_volume: Approx KM/week.

    JSON: { "options": [...] }
    `;

    return await callGroq(prompt, true);
}

/**
 * STEP 2: Generate the FULL schedule for a specific selected strategy.
 */
export async function generateFullPlanAction(stats: UserStats, selectedOptionId: string, options: any[]) {
    const selected = options.find(o => o.id === selectedOptionId) || options[0];
    const { easyRange, tempoRange, intervalPace } = getPaceRanges(stats.best5kTime);

    const prompt = `
    TASK: Generate a COMPLETE week-by-week schedule.
    STRATEGY: ${selected.title} - ${selected.strategy_summary}
    WEEKS: ${selected.total_weeks}
    PEAK VOLUME: ${selected.target_peak_volume}km

    STRICT REQUIREMENTS:
    1. **NO SKIPPING WEEKS**: Output ALL weeks from Week 1 to Week ${selected.total_weeks}.
    2. **STRICT STRUCTURED SYNTAX**: Use Intervals.icu syntax (e.g., "- 10m Warmup 6:10/km").
    3. **DAILY DETAIL**: Each week must have 7 days. Use 'rest' for rest days.
    
    PACING:
    - Easy: ${easyRange}
    - Tempo: ${tempoRange}
    - Intervals: ${intervalPace}

    JSON: { "weeks": [ { "week_number": 1, "days": [...] } ] }
    `;

    return await callGroq(prompt, false);
}

async function callGroq(prompt: string, isQuick: boolean) {
    const keys = getGroqKeys();
    for (let i = 0; i < keys.length; i++) {
        const groq = new Groq({ apiKey: keys[i] });
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a precise running coach. You ONLY output JSON. You never skip details." },
                    { role: "user", content: prompt }
                ],
                model: "llama-3.3-70b-versatile",
                response_format: { type: "json_object" },
                max_tokens: isQuick ? 2000 : 8000,
                temperature: 0.1,
            });
            const content = completion.choices[0].message.content;
            if (content) return JSON.parse(content);
        } catch (e: any) {
            console.error(`Groq Key ${i} failed:`, e.message);
            if (i === keys.length - 1) throw e;
        }
    }
}

/**
 * BACKWARD COMPATIBILITY WRAPPER (To be removed after UI update)
 */
export async function generateTrainingPlanAction(stats: UserStats) {
    console.warn("DEPRECATED: generateTrainingPlanAction. Switch to two-step generation.");
    const options = await generatePlanOptionsAction(stats);
    return options;
}
