"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { User, RealtimeChannel } from "@supabase/supabase-js";

interface Bookmark {
  id: string;
  title: string;
  url: string;
  user_id: string;
  created_at?: string;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  // ---------------------------
  // Fetch bookmarks for current user
  // ---------------------------
  const fetchBookmarks = async (userId: string) => {
    const { data, error } = await supabase
      .from("bookmarks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return console.error(error);
    setBookmarks(data || []);
  };

  // ---------------------------
  // Setup realtime subscription
  // ---------------------------
  const setupRealtime = (userId: string): RealtimeChannel => {
    return supabase
      .channel(`bookmarks-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookmarks", filter: `user_id=eq.${userId}` },
        () => fetchBookmarks(userId)
      )
      .subscribe();
  };

  // ---------------------------
  // Init session and listen for auth
  // ---------------------------
  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    const init = async () => {
      // Get current session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        setUser(session.user);
        await fetchBookmarks(session.user.id);
        channel = setupRealtime(session.user.id);
      }

      // Clean OAuth hash if present
      if (window.location.hash.includes("access_token")) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    init();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          if (session?.user) {
            setUser(session.user);
            await fetchBookmarks(session.user.id);
            if (!channel) channel = setupRealtime(session.user.id);
          }
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          setBookmarks([]);
          if (channel) supabase.removeChannel(channel);
        }
      }
    );

    return () => {
      if (channel) supabase.removeChannel(channel);
      authListener.subscription.unsubscribe();
    };
  }, []);

  // ---------------------------
  // Google Sign In
  // ---------------------------
  const signIn = async () => {
    const redirectUrl =
      process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : "http://localhost:3000";

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl },
    });

    if (error) console.error("Google login error:", error.message);
  };

  // ---------------------------
  // Sign Out
  // ---------------------------
  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setBookmarks([]);
  };

  // ---------------------------
  // Add Bookmark
  // ---------------------------
  const addBookmark = async () => {
    if (!title || !url || !user) return;

    const { error } = await supabase
      .from("bookmarks")
      .insert([{ title, url, user_id: user.id }]);

    if (error) return console.error(error);

    setTitle("");
    setUrl("");
  };

  // ---------------------------
  // Delete Bookmark
  // ---------------------------
  const deleteBookmark = async (id: string) => {
    if (!user) return;

    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (!error) await fetchBookmarks(user.id);
  };

  // ---------------------------
  // UI
  // ---------------------------
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <button
          onClick={signIn}
          className="bg-blue-600 text-white px-6 py-3 rounded"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto mt-10 p-4">
      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-bold">Smart Bookmark</h1>
        <button onClick={signOut} className="text-red-500 font-semibold">
          Logout
        </button>
      </div>

      {/* Add Bookmark */}
      <div className="mb-4 space-y-2">
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border p-2 rounded"
        />
        <input
          type="text"
          placeholder="URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full border p-2 rounded"
        />
        <button
          onClick={addBookmark}
          className="bg-green-600 text-white px-4 py-2 rounded w-full"
        >
          Add Bookmark
        </button>
      </div>

      {/* Bookmark List */}
      <div className="space-y-3">
        {bookmarks.length === 0 && (
          <p className="text-gray-500 text-center">No bookmarks yet. Add one!</p>
        )}
        {bookmarks.map((bookmark) => (
          <div
            key={bookmark.id}
            className="border p-3 rounded flex justify-between items-center"
          >
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 font-semibold"
            >
              {bookmark.title}
            </a>
            <button
              onClick={() => deleteBookmark(bookmark.id)}
              className="text-red-500"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
