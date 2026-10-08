"use client";

import { useEffect } from "react";

export default function OAuthCallbackPage() {
  useEffect(() => {
    window.location.href = "project-flame://";
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "#000B12",
        color: "#F9FBFE",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <p>Returning to Flame&hellip;</p>
    </div>
  );
}
