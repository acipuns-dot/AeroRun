// Quick script to delete current user from Supabase
// Run this in the browser console while logged in

async function deleteCurrentUser() {
    const { createClient } = await import('./src/lib/supabase.ts');
    const supabase = createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        console.log('No user logged in');
        return;
    }

    console.log('Current user:', user.email);

    // Delete profile
    const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

    if (profileError) {
        console.error('Error deleting profile:', profileError);
    } else {
        console.log('✅ Profile deleted');
    }

    // Delete workouts
    const { error: workoutsError } = await supabase
        .from('workouts')
        .delete()
        .eq('user_id', user.id);

    if (workoutsError) {
        console.error('Error deleting workouts:', workoutsError);
    } else {
        console.log('✅ Workouts deleted');
    }

    // Sign out
    await supabase.auth.signOut();
    console.log('✅ Signed out');

    console.log('✅ All data cleared! You can now create a new account.');
}

deleteCurrentUser();
