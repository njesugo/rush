import React from "react";
import { colors, fonts, radius } from "../tokens";

/**
 * Mock UI of "Claude Cowork" used as a placeholder screenshot for the PR8
 * demo. In production this is replaced by an <img src=... /> from the user's
 * uploaded screenshot.
 */
export const MockClaudeCowork: React.FC = () => (
  <div
    style={{
      width: "100%",
      height: "100%",
      backgroundColor: "#fff",
      display: "grid",
      gridTemplateColumns: "240px 1fr",
      fontFamily: fonts.sans,
      color: colors.text,
    }}
  >
    {/* Sidebar */}
    <aside
      style={{
        backgroundColor: "#F4F5F7",
        borderRight: `1px solid ${colors.border}`,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: -0.5,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: colors.accent,
          }}
        />
        Claude Cowork
      </div>
      {["Mes espaces", "Équipe", "Projets actifs", "Templates", "Paramètres"].map(
        (label, i) => (
          <div
            key={label}
            style={{
              padding: "10px 12px",
              borderRadius: radius.small,
              backgroundColor: i === 1 ? "#fff" : "transparent",
              fontWeight: i === 1 ? 600 : 500,
              fontSize: 16,
              boxShadow: i === 1 ? "0 1px 3px rgba(0,0,0,0.06)" : undefined,
            }}
          >
            {label}
          </div>
        )
      )}
    </aside>

    {/* Main */}
    <main style={{ padding: 32, display: "flex", flexDirection: "column", gap: 22 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 4 }}>
            Espace partagé
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
            Marketing Sprint Q2
          </h1>
        </div>
        <div
          style={{
            backgroundColor: colors.accent,
            color: "#fff",
            padding: "10px 18px",
            borderRadius: radius.small,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          + Inviter
        </div>
      </header>

      {[
        {
          author: "Jordan",
          role: "Product",
          msg: "Claude, fais-moi un brief pour la nouvelle landing.",
        },
        {
          author: "Claude",
          role: "AI",
          msg: "Voici 3 angles possibles selon les personas que vous avez définis…",
        },
        {
          author: "Léa",
          role: "Design",
          msg: "Top, on prend l'angle 2. Je commence les mockups.",
        },
      ].map((m, i) => (
        <div
          key={i}
          style={{
            padding: 18,
            borderRadius: radius.card / 2,
            border: `1px solid ${colors.border}`,
            backgroundColor: m.role === "AI" ? "rgba(24,119,242,0.06)" : "#fff",
            display: "flex",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              backgroundColor: m.role === "AI" ? colors.accent : "#E8EAEE",
              color: m.role === "AI" ? "#fff" : colors.text,
              fontWeight: 700,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {m.author[0]}
          </div>
          <div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 4 }}>
              {m.author} · {m.role}
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.45 }}>{m.msg}</div>
          </div>
        </div>
      ))}
    </main>
  </div>
);
