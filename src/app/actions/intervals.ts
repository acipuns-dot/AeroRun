"use server";

import { createClient } from "@/lib/server-utils"; // Use the cookie-aware client

const INTERVALS_BASE_URL = "https://intervals.icu/api/v1";

const getHeaders = (apiKey: string) => {
    const auth = Buffer.from(`API_KEY:${apiKey}`).toString("base64");
    return {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
    };
};

async function getCredentials() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile, error } = await supabase
        .from("profiles")
        .select("intervals_athlete_id, intervals_api_key")
        .eq("id", user.id)
        .single();

    if (error || !profile?.intervals_api_key || !profile?.intervals_athlete_id) {
        console.error("[getCredentials] Missing profile or credentials:", { error, hasApiKey: !!profile?.intervals_api_key, hasAthleteId: !!profile?.intervals_athlete_id });
        throw new Error("Intervals.icu credentials not configured.");
    }

    // SANITIZATION: Remove any leading 'i' or non-numeric characters from Athlete ID
    const sanitizedId = profile.intervals_athlete_id.replace(/\D/g, "");
    console.log("[getCredentials] Sanitized Athlete ID:", { original: profile.intervals_athlete_id, sanitized: sanitizedId });

    return {
        athleteId: sanitizedId,
        apiKey: profile.intervals_api_key
    };
}

export async function getActivitiesAction() {
    console.log('[Server Action] getActivitiesAction called');

    try {
        const credentials = await getCredentials().catch(err => {
            console.error("[Server Action] Credential error:", err.message);
            return null;
        });

        if (!credentials) {
            return { data: [], error: "Intervals.icu credentials not configured. Please check your settings." };
        }

        const { athleteId, apiKey } = credentials;

        // Calculate date 6 months ago for the 'oldest' parameter
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const oldestDate = sixMonthsAgo.toISOString().split('T')[0];

        const url = `${INTERVALS_BASE_URL}/athlete/${athleteId}/activities?oldest=${oldestDate}`;
        console.log('[Server Action] Fetching from:', url);

        const response = await fetch(url, {
            headers: getHeaders(apiKey),
            cache: 'no-store'
        });

        console.log('[Server Action] Response status:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Server Action] API Error: ${response.status} ${response.statusText}`);
            console.error(`[Server Action] Error body:`, errorText);

            if (response.status === 401) {
                return { data: [], error: "Authentication failed. Please verify your API Key in Settings." };
            }
            if (response.status === 404) {
                return { data: [], error: "Athlete not found. Please verify your Athlete ID in Settings." };
            }
            return { data: [], error: `Intervals.icu API Error: ${response.status}` };
        }

        const data = await response.json();
        console.log('[Server Action] Processed results:', {
            isArray: Array.isArray(data),
            count: Array.isArray(data) ? data.length : 'N/A'
        });

        return { data: Array.isArray(data) ? data : [], error: null };
    } catch (error: any) {
        console.error("[Server Action] Exception in getActivitiesAction:", error);
        return { data: [], error: error.message || "Failed to fetch activities." };
    }
}

export async function pushWorkoutAction(workout: any) {
    try {
        const { athleteId, apiKey } = await getCredentials();
        const response = await fetch(
            `${INTERVALS_BASE_URL}/athlete/${athleteId}/events`,
            {
                method: "POST",
                headers: getHeaders(apiKey),
                body: JSON.stringify(workout),
            }
        );
        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
        return await response.json();
    } catch (error) {
        console.error("Error pushing workout:", error);
        return null;
    }
}

export async function deleteWorkoutAction(eventId: string) {
    try {
        const { athleteId, apiKey } = await getCredentials();
        const response = await fetch(
            `${INTERVALS_BASE_URL}/athlete/${athleteId}/events/${eventId}`,
            {
                method: "DELETE",
                headers: getHeaders(apiKey),
            }
        );
        return response.status === 200 || response.status === 204;
    } catch (error) {
        console.error("Error deleting workout:", error);
        return false;
    }
}

export async function getFutureEventsAction() {
    try {
        const { athleteId, apiKey } = await getCredentials();
        const today = new Date().toISOString().split("T")[0];
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 6);
        const end = futureDate.toISOString().split("T")[0];

        const response = await fetch(
            `${INTERVALS_BASE_URL}/athlete/${athleteId}/events?oldest=${today}&newest=${end}`,
            { headers: getHeaders(apiKey), cache: 'no-store' }
        );
        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
        return await response.json();
    } catch (error) {
        console.error("Error fetching future events:", error);
        return [];
    }
}

export async function getActivityDetailsAction(activityId: string) {
    console.log('[Server Action] getActivityDetailsAction called for ID:', activityId);

    try {
        const { athleteId, apiKey } = await getCredentials();
        const url = `${INTERVALS_BASE_URL}/athlete/${athleteId}/activities/${activityId}`;
        console.log('[Server Action] Fetching activity details from:', url);

        const response = await fetch(url, {
            headers: getHeaders(apiKey),
            cache: 'no-store'
        });

        console.log('[Server Action] Activity detail response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Server Action] API Error: ${response.status} ${response.statusText}`);
            console.error(`[Server Action] Error body:`, errorText);
            return null;
        }

        const data = await response.json();
        console.log('[Server Action] Activity details fetched successfully');
        return data;
    } catch (error) {
        console.error("[Server Action] Exception fetching activity details:", error);
        return null;
    }
}

export async function getActivityStreamsAction(activityId: string) {
    console.log('[Server Action] getActivityStreamsAction called for ID:', activityId);

    try {
        const { apiKey } = await getCredentials();
        const url = `${INTERVALS_BASE_URL}/activity/${activityId}/streams.json?types=latlng`;
        console.log('[Server Action] Fetching activity streams from:', url);

        const response = await fetch(url, {
            headers: getHeaders(apiKey),
            cache: 'no-store'
        });

        if (!response.ok) {
            console.error(`[Server Action] API Error: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        console.log('[Server Action] Activity streams fetched:', Array.isArray(data) ? data.map((s: any) => s.type) : 'Error format');
        if (Array.isArray(data)) {
            const latlng = data.find((s: any) => s.type === 'latlng');
            if (latlng) {
                console.log('[Server Action] LatLng data length:', latlng.data?.length);
                if (latlng.data?.length > 0) {
                    console.log('[Server Action] First coord sample:', latlng.data[0]);
                }
            }
        }
        return data;
    } catch (error) {
        console.error("[Server Action] Exception fetching activity streams:", error);
        return null;
    }
}
