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
};
