"use client";
import { useProfile } from "@/lib/hooks/useProfile";
import { useUser } from "@/lib/hooks/useUser";
import { supabaseClient } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";

export default function DebugPage() {
    const { user, loading: userLoading } = useUser();
    const { flags, loading: profileLoading } = useProfile();
    const [rawProfile, setRawProfile] = useState<any>(null);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (!user) return;
        supabaseClient.from('profiles').select('*').eq('id', user.id).maybeSingle()
            .then(({ data, error }) => {
                setRawProfile(data);
                setError(error);
            });
    }, [user]);

    return (
        <div className="p-8 font-mono text-sm max-w-2xl mx-auto whitespace-pre-wrap word-break-all">
            <h1 className="text-xl font-bold mb-4">Debug Info</h1>

            <div className="mb-4 p-4 border rounded bg-gray-50">
                <h2 className="font-bold">User Session</h2>
                <p>Loading: {userLoading ? 'Yes' : 'No'}</p>
                <p>User ID: {user?.id || 'None'}</p>
                <p>Email: {user?.email || 'None'}</p>
            </div>

            <div className="mb-4 p-4 border rounded bg-gray-50">
                <h2 className="font-bold">Profile Hook</h2>
                <p>Loading: {profileLoading ? 'Yes' : 'No'}</p>
                <p>Flags: {JSON.stringify(flags, null, 2)}</p>
                <p>Is Admin (Flag): {flags?.isAdmin ? 'YES' : 'NO'}</p>
            </div>

            <div className="mb-4 p-4 border rounded bg-gray-50">
                <h2 className="font-bold">Raw DB Fetch</h2>
                {error && <p className="text-red-600">Error: {JSON.stringify(error)}</p>}
                {rawProfile ? (
                    <p>{JSON.stringify(rawProfile, null, 2)}</p>
                ) : (
                    <p className="text-orange-600">No Profile Found (or Permission Denied)</p>
                )}
            </div>

            <div className="p-4 border border-blue-200 bg-blue-50 rounded">
                <p><strong>Diagnosis:</strong></p>
                {rawProfile ? (
                    rawProfile.is_admin ? (
                        <p className="text-green-600">You ARE an admin in the DB. The chip SHOULD be visible.</p>
                    ) : (
                        <p className="text-red-600">You are NOT set as admin in the DB.</p>
                    )
                ) : (
                    <p className="text-orange-600">Database read failed. This confirms an RLS permission issue. Run the `fix_profile_permissions.sql` script.</p>
                )}
            </div>

            <div className="mt-8 p-4 border border-purple-200 bg-purple-50 rounded">
                <h2 className="font-bold text-lg mb-2">Emergency Admin Fix</h2>
                <p className="mb-2">If you are the owner but locked out, click below to force-enable Admin access for your account.</p>
                <div className="flex gap-2">
                    <input
                        className="border p-2 rounded w-full"
                        placeholder="Your Email"
                        value={user?.email || ''}
                        readOnly
                    />
                    <button
                        onClick={async () => {
                            if (!user?.email) return alert("No email found");
                            const res = await fetch('/api/seed-admin', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email: user.email, isAdmin: true })
                            });
                            if (res.ok) {
                                alert("Success! You are now an Admin. Refresh the page.");
                                window.location.reload();
                            } else {
                                const err = await res.json();
                                alert("Failed: " + JSON.stringify(err));
                            }
                        }}
                        className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 whitespace-nowrap"
                    >
                        Make Me Admin
                    </button>
                </div>
            </div>
        </div>
    );
}
