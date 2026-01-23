"use server";

import { createClient } from "@/lib/server-utils";
import { LocalActivity } from "@/types";

export async function saveActivityAction(activityData: Partial<LocalActivity>) {
    console.log('[Server Action] saveActivityAction called');

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            throw new Error("Authentication failed.");
        }

        // 1. Identify Today's Workout for Auto-Matching
        const today = new Date().toISOString().split('T')[0];
        console.log(`[Server Action] Attempting auto-match for date: ${today}`);

        const { data: workout, error: workoutError } = await supabase
            .from("workouts")
            .select("id, type")
            .eq("user_id", user.id)
            .eq("date", today)
            .eq("completed", false)
            .maybeSingle();

        if (workoutError) {
            console.error("[Server Action] Error fetching workout for match:", workoutError);
        }

        // 2. Prepare Activity Data
        const finalActivityData = {
            ...activityData,
            user_id: user.id,
            workout_id: workout?.id || null, // Link if found
            start_date: activityData.start_date || new Date().toISOString(),
        };

        // 3. Save Activity
        const { data: savedActivity, error: saveError } = await supabase
            .from("activities")
            .insert([finalActivityData])
            .select()
            .single();

        if (saveError) {
            console.error("[Server Action] Error saving activity:", saveError);
            throw new Error(`Failed to save activity: ${saveError.message}`);
        }

        console.log("[Server Action] Activity saved locally:", savedActivity.id);

        // 4. If auto-matched, mark workout as completed
        if (workout?.id) {
            console.log(`[Server Action] Auto-matching found: ${workout.id}. Marking as completed.`);
            const { error: updateError } = await supabase
                .from("workouts")
                .update({ completed: true })
                .eq("id", workout.id);

            if (updateError) {
                console.error("[Server Action] Error updating workout status:", updateError);
            }
        }

        return { success: true, data: savedActivity };
    } catch (error: any) {
        console.error("[Server Action] Exception in saveActivityAction:", error);
        return { success: false, error: error.message || "Failed to save activity locally." };
    }
}

export async function deleteActivityAction(activityId: string, intervalsId?: string | null) {
    console.log('[Server Action] deleteActivityAction called for ID:', activityId);

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            throw new Error("Authentication failed.");
        }

        // 1. Delete from Supabase
        const { error: deleteError } = await supabase
            .from("activities")
            .delete()
            .eq("id", activityId)
            .eq("user_id", user.id);

        if (deleteError) {
            console.error("[Server Action] Error deleting activity locally:", deleteError);
            throw new Error(`Failed to delete activity locally: ${deleteError.message}`);
        }

        console.log("[Server Action] Activity deleted locally:", activityId);

        // 2. Delete from Intervals.icu if ID exists
        if (intervalsId) {
            console.log("[Server Action] Attempting sync deletion to Intervals.icu for ID:", intervalsId);
            try {
                // We'll import and use the existing delete action from intervals.ts
                const { deleteWorkoutAction } = await import("./intervals");
                const syncSuccess = await deleteWorkoutAction(intervalsId);
                console.log("[Server Action] Intervals sync deletion success:", syncSuccess);
            } catch (err) {
                console.warn("[Server Action] Sync deletion failed (ignoring for local success):", err);
            }
        }

        return { success: true };
    } catch (error: any) {
        console.error("[Server Action] Exception in deleteActivityAction:", error);
        return { success: false, error: error.message || "Failed to delete activity." };
    }
}
