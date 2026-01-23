"use server";

import { createClient } from "@/lib/server-utils";
import { Profile } from "@/types";

export async function saveProfileAction(profileData: Partial<Profile>) {
    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        return { success: false, error: "Not authenticated" };
    }

    const { data, error } = await supabase
        .from("profiles")
        .upsert({
            ...profileData,
            id: session.user.id,
            email: session.user.email,
        }, { onConflict: 'id' })
        .select()
        .single();

    if (error) {
        console.error('[saveProfileAction] Error:', error);
        return { success: false, error: error.message };
    }

    return { success: true, data };
}
