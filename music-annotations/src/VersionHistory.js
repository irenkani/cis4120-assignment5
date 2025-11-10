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
    <div style={{ 
      marginTop: 20, 
      padding: 25, 
      background: "white", 
      border: "3px solid var(--accent-dark)", 
      borderRadius: 8 
    }}>
      <h3 style={{ marginTop: 0, marginBottom: 20 }}>📜 Annotation History</h3>
      {history.length === 0 ? (
        <div style={{ 
          padding: 20, 
          background: "var(--accent-mint)", 
          borderRadius: 8, 
          border: "2px dashed var(--accent-dark)" 
        }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            No history yet. Add some annotations and click "Apply All Changes" to save them!
          </p>
          <p style={{ marginTop: 10, fontSize: 14, color: "var(--accent-dark)" }}>
            <strong>Note:</strong> Make sure you've run the database setup SQL commands to enable history tracking.
          </p>
        </div>
      ) : (
        history.map((entry, i) => (
          <div key={i} style={{ 
            marginBottom: 25, 
            paddingBottom: 20, 
            borderBottom: "2px solid var(--secondary)"
          }}>
            <h4 style={{ marginBottom: 10 }}>{entry.date}</h4>
            <p style={{ color: "var(--accent-dark)", marginBottom: 15 }}>
              {entry.count} annotation(s) created
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 15 }}>
              {entry.annotations.map((a, j) => (
                <div
                  key={j}
                  style={{
                    padding: 15,
                    border: "2px solid var(--accent-dark)",
                    borderRadius: 8,
                    background: "var(--dominant)",
                    fontSize: 14,
                    minWidth: 180
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

