"use server";

const INTERVALS_BASE_URL = "https://intervals.icu/api/v1";
const ATHLETE_ID = process.env.INTERVALS_API_ATHLETE_ID;
const API_KEY = process.env.INTERVALS_API_KEY;

const getHeaders = () => {
    if (!API_KEY || !ATHLETE_ID) {
        throw new Error("Intervals.icu API credentials not configured.");
    }
    const auth = Buffer.from(`API_KEY:${API_KEY}`).toString("base64");
    return {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
    };
};

export async function getActivitiesAction() {
    console.log('[Server Action] getActivitiesAction called');
    console.log('[Server Action] ATHLETE_ID:', ATHLETE_ID);
    console.log('[Server Action] API_KEY configured:', !!API_KEY);

    try {
        // Calculate date 6 months ago for the 'oldest' parameter (required by Intervals.icu API)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const oldestDate = sixMonthsAgo.toISOString().split('T')[0]; // Format: YYYY-MM-DD

        const url = `${INTERVALS_BASE_URL}/athlete/${ATHLETE_ID}/activities?oldest=${oldestDate}`;
        console.log('[Server Action] Fetching from:', url);

        const response = await fetch(url, {
            headers: getHeaders(),
            cache: 'no-store'
        });

        console.log('[Server Action] Response status:', response.status);
        console.log('[Server Action] Response ok:', response.ok);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Server Action] API Error: ${response.status} ${response.statusText}`);
            console.error(`[Server Action] Error body:`, errorText);
            return [];
        }

        const data = await response.json();
        console.log('[Server Action] Raw response type:', typeof data);
        console.log('[Server Action] Is array:', Array.isArray(data));
        console.log('[Server Action] Activities count:', Array.isArray(data) ? data.length : 'N/A');

        if (Array.isArray(data) && data.length > 0) {
            console.log('[Server Action] First activity:', data[0]);
        }

        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("[Server Action] Exception:", error);
        return [];
    }
}

export async function pushWorkoutAction(workout: any) {
    try {
        const response = await fetch(
            `${INTERVALS_BASE_URL}/athlete/${ATHLETE_ID}/events`,
            {
                method: "POST",
                headers: getHeaders(),
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
        const response = await fetch(
            `${INTERVALS_BASE_URL}/athlete/${ATHLETE_ID}/events/${eventId}`,
            {
                method: "DELETE",
                headers: getHeaders(),
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
        const today = new Date().toISOString().split("T")[0];
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 6);
        const end = futureDate.toISOString().split("T")[0];

        const response = await fetch(
            `${INTERVALS_BASE_URL}/athlete/${ATHLETE_ID}/events?oldest=${today}&newest=${end}`,
            { headers: getHeaders(), cache: 'no-store' }
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
        const url = `${INTERVALS_BASE_URL}/athlete/${ATHLETE_ID}/activities/${activityId}`;
        console.log('[Server Action] Fetching activity details from:', url);

        const response = await fetch(url, {
            headers: getHeaders(),
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
        const url = `${INTERVALS_BASE_URL}/athlete/${ATHLETE_ID}/activities/${activityId}/streams.json?types=latlng`;
        console.log('[Server Action] Fetching activity streams from:', url);

        const response = await fetch(url, {
            headers: getHeaders(),
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
