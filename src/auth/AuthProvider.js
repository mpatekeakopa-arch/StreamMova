// src/auth/AuthProvider.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const fetchProfile = async (userId) => {
    if (!userId) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("id", userId)
      .single();

    if (error) {
      // If row doesn’t exist yet, keep null (don’t crash UI)
      console.warn("fetchProfile error:", error.message);
      return null;
    }

    return data;
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      const s = data?.session || null;

      if (!mounted) return;

      setSession(s);
      setAuthUser(s?.user || null);

      if (s?.user?.id) {
        const p = await fetchProfile(s.user.id);
        if (!mounted) return;
        setProfile(p);
      } else {
        setProfile(null);
      }

      setLoading(false);
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;

      setLoading(true);
      setSession(s);
      setAuthUser(s?.user || null);

      if (s?.user?.id) {
        const p = await fetchProfile(s.user.id);
        if (!mounted) return;
        setProfile(p);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const displayName = useMemo(() => {
    // preferred: profiles.display_name
    if (profile?.display_name) return profile.display_name;

    // fallback: auth metadata (if ever set)
    const metaName = authUser?.user_metadata?.display_name || authUser?.user_metadata?.name;
    if (metaName) return metaName;

    // fallback: email local part
    const email = authUser?.email || "";
    if (email.includes("@")) return email.split("@")[0];

    return "User";
  }, [profile, authUser]);

  const value = useMemo(
    () => ({
      loading,
      session,
      authUser,
      profile,
      displayName,
      signOut: () => supabase.auth.signOut(),
      refreshProfile: async () => {
        if (!authUser?.id) return;
        const p = await fetchProfile(authUser.id);
        setProfile(p);
      },
    }),
    [loading, session, authUser, profile, displayName]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider />");
  return ctx;
}