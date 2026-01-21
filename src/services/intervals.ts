const INTERVALS_BASE_URL = "https://intervals.icu/api/v1";
const ATHLETE_ID = process.env.INTERVALS_API_ATHLETE_ID;
const API_KEY = process.env.INTERVALS_API_KEY;

const getHeaders = () => {
    const auth = Buffer.from(`API_KEY:${API_KEY}`).toString("base64");
    return {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
    };
};

export const intervalsService = {
    getActivities: async () => {
        const response = await fetch(
            `${INTERVALS_BASE_URL}/athlete/${ATHLETE_ID}/activities`,
            { headers: getHeaders() }
        );
        return response.json();
    },

    pushWorkout: async (workout: any) => {
        const response = await fetch(
            `${INTERVALS_BASE_URL}/athlete/${ATHLETE_ID}/events`,
            {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify(workout),
            }
        );
        return response.json();
    },

    // Get future planned workouts (next 3 months)
    getFutureEvents: async () => {
        const today = new Date().toISOString().split("T")[0];
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 6); // Look 6 months ahead
        const end = futureDate.toISOString().split("T")[0];

        const response = await fetch(
            `${INTERVALS_BASE_URL}/athlete/${ATHLETE_ID}/events?oldest=${today}&newest=${end}`,
            { headers: getHeaders() }
        );
        return response.json();
    },

    deleteWorkout: async (eventId: string) => {
        const response = await fetch(
            `${INTERVALS_BASE_URL}/athlete/${ATHLETE_ID}/events/${eventId}`,
            {
                method: "DELETE",
                headers: getHeaders(),
            }
        );
        return response.status === 204;
    },
};
