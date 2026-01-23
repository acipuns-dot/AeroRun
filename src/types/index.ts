export type Profile = {
    id: string;
    email: string;
    height: number;
    weight: number;
    age: number;
    best_5k_time: string;
    training_level: 'beginner' | 'intermediate' | 'elite';
    onboarded: boolean;
    created_at: string;
    intervals_athlete_id?: string;
    intervals_api_key?: string;
    display_name?: string;
};

export type Workout = {
    id: string;
    user_id: string;
    week_number: number;
    day_of_week: string;
    type: 'rest' | 'easy' | 'intervals' | 'long' | 'tempo';
    description: string;
    distance_km: number;
    duration_mins: number;
    target_pace: string;
    date: string;
    intervals_event_id?: string;
    structured_workout?: string;
};

export interface GeoPoint {
    latitude: number;
    longitude: number;
    altitude: number | null;
    timestamp: number;
    speed: number | null;
    accuracy: number | null;
}

export type LocalActivity = {
    id: string;
    user_id: string;
    name: string;
    distance: number;
    moving_time: number;
    elapsed_time: number;
    start_date: string;
    type: string;
    path: GeoPoint[];
    calories?: number;
    average_pace?: number;
    workout_id?: string;
    intervals_id?: string;
    created_at: string;
};
