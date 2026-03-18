<<<<<<< HEAD
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

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.warn("fetchProfile error:", error.message);
        return null;
      }

      return data || null;
    } catch (err) {
      console.warn("fetchProfile unexpected error:", err?.message || err);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    const syncAuthState = async (currentSession) => {
      if (!mounted) return;

      setLoading(true);

      try {
        const s = currentSession || null;

        setSession(s);
        setAuthUser(s?.user || null);

        if (s?.user?.id) {
          const p = await fetchProfile(s.user.id);
          if (!mounted) return;
          setProfile(p);
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error("Auth sync error:", err);
        if (!mounted) return;
        setProfile(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("getSession error:", error.message);
          await syncAuthState(null);
          return;
        }

        await syncAuthState(data?.session || null);
      } catch (err) {
        console.error("init auth error:", err);
        if (mounted) setLoading(false);
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      syncAuthState(s);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const displayName = useMemo(() => {
    if (profile?.display_name) return profile.display_name;

    const metaName =
      authUser?.user_metadata?.display_name || authUser?.user_metadata?.name;
    if (metaName) return metaName;

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
=======
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

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.warn("fetchProfile error:", error.message);
        return null;
      }

      return data || null;
    } catch (err) {
      console.warn("fetchProfile unexpected error:", err?.message || err);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    const syncAuthState = async (currentSession) => {
      if (!mounted) return;

      setLoading(true);

      try {
        const s = currentSession || null;

        setSession(s);
        setAuthUser(s?.user || null);

        if (s?.user?.id) {
          const p = await fetchProfile(s.user.id);
          if (!mounted) return;
          setProfile(p);
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error("Auth sync error:", err);
        if (!mounted) return;
        setProfile(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("getSession error:", error.message);
          await syncAuthState(null);
          return;
        }

        await syncAuthState(data?.session || null);
      } catch (err) {
        console.error("init auth error:", err);
        if (mounted) setLoading(false);
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      syncAuthState(s);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const displayName = useMemo(() => {
    if (profile?.display_name) return profile.display_name;

    const metaName =
      authUser?.user_metadata?.display_name || authUser?.user_metadata?.name;
    if (metaName) return metaName;

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
>>>>>>> 46f15c169046cc7150115b0495184da511f5cc31
