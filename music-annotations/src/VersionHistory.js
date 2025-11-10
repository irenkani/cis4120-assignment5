import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function VersionHistory() {
  const [history, setHistory] = useState([]);
  const [annotations, setAnnotations] = useState([]);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    // Fetch annotations
    const { data: annotationsData, error: annotationsError } = await supabase
      .from("annotations")
      .select("*")
      .order("created_at", { ascending: false });

    if (annotationsError) {
      console.error("Error loading annotations:", annotationsError);
      return;
    }

    if (annotationsData && annotationsData.length > 0) {
      // Fetch all profiles
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, name, role");

      // Create a map of user_id to profile
      const profilesMap = {};
      if (profilesData) {
        profilesData.forEach((p) => {
          profilesMap[p.user_id] = p;
        });
      }

      // Merge annotations with profile data
      const annotationsWithProfiles = annotationsData.map((a) => ({
        ...a,
        profiles: profilesMap[a.created_by] || { name: "Unknown", role: "unknown" },
      }));

      setAnnotations(annotationsWithProfiles);

      const grouped = {};
      annotationsWithProfiles.forEach((a) => {
        const date = new Date(a.created_at).toLocaleDateString();
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(a);
      });

      const historyList = Object.keys(grouped).map((date) => ({
        date,
        annotations: grouped[date],
        count: grouped[date].length,
      }));

      setHistory(historyList);
    }
  }

  return (
    <div style={{ marginTop: 20, padding: 20, background: "white", border: "3px solid #007bff", borderRadius: 5 }}>
      <h3 style={{ color: "#007bff", marginTop: 0 }}>📜 Annotation History</h3>
      {history.length === 0 ? (
        <div style={{ padding: 20, background: "#f0f8ff", borderRadius: 5, border: "1px dashed #007bff" }}>
          <p style={{ margin: 0, fontSize: 16 }}>
            No history yet. Add some annotations and click "Apply All Changes" to save them!
          </p>
          <p style={{ marginTop: 10, fontSize: 14, color: "#666" }}>
            <strong>Note:</strong> Make sure you've run the database setup SQL commands to enable history tracking.
          </p>
        </div>
      ) : (
        history.map((entry, i) => (
          <div key={i} style={{ marginBottom: 20, borderBottom: "1px solid #ddd", paddingBottom: 10 }}>
            <h4>{entry.date}</h4>
            <p>{entry.count} annotation(s) created</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {entry.annotations.map((a, j) => (
                <div
                  key={j}
                  style={{
                    padding: 10,
                    border: "1px solid #ccc",
                    borderRadius: 5,
                    background: "#f9f9f9",
                    fontSize: 14,
                  }}
                >
                  <div>
                    <strong>Type:</strong> {a.type}
                  </div>
                  <div>
                    <strong>Position:</strong> ({a.x.toFixed(0)}, {a.y.toFixed(0)})
                  </div>
                  {a.color && (
                    <div>
                      <strong>Color:</strong>{" "}
                      <span
                        style={{
                          display: "inline-block",
                          width: 15,
                          height: 15,
                          background: a.color,
                          border: "1px solid #000",
                        }}
                      />
                    </div>
                  )}
                  {a.profiles && (
                    <div>
                      <strong>By:</strong> {a.profiles.name} ({a.profiles.role})
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

