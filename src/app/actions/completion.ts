"use server";

import { supabase } from "@/lib/supabase";

export async function toggleWorkoutCompletionAction(workoutId: string, completed: boolean) {
    const { data, error } = await supabase
        .from("workouts")
        .update({ completed })
        .eq("id", workoutId)
        .select()
        .single();

    if (error) {
        console.error("Error toggling workout completion:", error);
        return null;
    }

    return data;
}
