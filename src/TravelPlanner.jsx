import { useState, useEffect, useRef, useCallback } from "react";

const N8N_WEBHOOK = "https://pragathish07.app.n8n.cloud/webhook/travel-planner";
const N8N_HISTORY = "https://pragathish07.app.n8n.cloud/webhook/travel-history";

// ─── TOKENS ───────────────────────────────────────────────────
const T = {
  bg:      "#07080d",
  panel:   "#0b0d16",
  surface: "#10131e",
  card:    "#141828",
  border:  "#1c2238",
  borderHi:"#2a3558",
  ink:     "#e4e9f8",
  sub:     "#7a84aa",
  muted:   "#3d4468",
  accent:  "#4f8ef7",
  green:   "#34d399",
  gold:    "#f59e0b",
  purple:  "#9b7ff4",
  red:     "#f87171",
  orange:  "#fb923c",
  mono:    "'IBM Plex Mono', monospace",
  sans:    "'Plus Jakarta Sans', sans-serif",
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{background:${T.bg};color:${T.ink};font-family:${T.sans};font-size:14px;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:${T.border};border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:${T.borderHi}}

@keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}

.fade-up{animation:fadeUp .22s ease both}

textarea::placeholder{color:${T.muted}}
textarea:focus{outline:none}
button{font-family:${T.sans}}

.chat-item{
  padding:9px 11px;border-radius:8px;cursor:pointer;
  border:1px solid transparent;transition:all .15s;
  display:flex;align-items:flex-start;gap:8px;
}
.chat-item:hover{background:${T.surface};border-color:${T.border}}
.chat-item.active{background:${T.surface};border-color:${T.borderHi}}

.tab-btn{
  padding:5px 12px;border-radius:6px;border:1px solid transparent;
  font-size:.7rem;font-weight:600;cursor:pointer;transition:all .15s;
  font-family:${T.sans};letter-spacing:.02em;white-space:nowrap;
}
.tab-btn.active{background:${T.surface};border-color:${T.borderHi};color:${T.ink}}
.tab-btn:not(.active){background:transparent;color:${T.muted}}
.tab-btn:not(.active):hover{color:${T.sub}}

.book-btn{
  padding:4px 10px;border-radius:6px;font-size:.65rem;
  font-weight:700;letter-spacing:.03em;cursor:pointer;
  border:none;transition:all .15s;text-decoration:none;
  display:inline-flex;align-items:center;gap:3px;font-family:${T.sans};
}
.book-btn:hover{filter:brightness(1.12)}

.day-toggle{
  width:100%;padding:10px 13px;border-radius:9px;
  background:${T.card};border:1px solid ${T.border};
  cursor:pointer;display:flex;justify-content:space-between;
  align-items:center;transition:all .15s;text-align:left;
}
.day-toggle:hover{border-color:${T.borderHi}}
.day-toggle.open{border-radius:9px 9px 0 0;border-color:${T.borderHi}}

/* Markdown-like styles for itinerary text */
.itin-body h2{font-size:.88rem;font-weight:700;color:${T.ink};margin:18px 0 8px;padding-bottom:5px;border-bottom:1px solid ${T.border}}
.itin-body h3{font-size:.8rem;font-weight:600;color:${T.accent};margin:14px 0 5px}
.itin-body p{font-size:.78rem;color:${T.sub};line-height:1.75;margin-bottom:6px}
.itin-body ul{padding-left:16px;margin-bottom:8px}
.itin-body li{font-size:.78rem;color:${T.sub};line-height:1.75;margin-bottom:3px}
.itin-body strong{color:${T.ink};font-weight:600}
.itin-body table{width:100%;border-collapse:collapse;font-size:.75rem;margin:10px 0}
.itin-body th{background:${T.surface};color:${T.sub};padding:7px 10px;text-align:left;font-weight:600;border:1px solid ${T.border}}
.itin-body td{padding:7px 10px;border:1px solid ${T.border};color:${T.sub}}
.itin-body td:first-child{color:${T.ink};font-weight:500}
.itin-body hr{border:none;border-top:1px solid ${T.border};margin:16px 0}
.itin-body .emoji-header{display:flex;align-items:center;gap:8px}
`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── PIPELINE ─────────────────────────────────────────────────
const STAGES = [
  { id: "searching", icon: "⌕", label: "Researching destination" },
  { id: "flights",   icon: "↗", label: "Scanning flights"        },
  { id: "hotels",    icon: "⊞", label: "Finding hotels"          },
  { id: "routing",   icon: "◎", label: "Planning route"          },
  { id: "writing",   icon: "≡", label: "Writing itinerary"       },
];
const STAGE_MS = { searching:8000, flights:4500, hotels:3500, routing:7000, writing:10000 };

// ─── PARSING ──────────────────────────────────────────────────
function safeParseJSON(str) {
  if (!str) return null;
  if (typeof str !== "string") return str;
  // Strip markdown code fences
  let clean = str.trim();
  clean = clean.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(clean); } catch { return null; }
}

function safeArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    if (val === "[]" || val.trim() === "") return [];
    const p = safeParseJSON(val);
    return Array.isArray(p) ? p : [];
  }
  return [];
}

// Parse the full n8n webhook response into a clean object
function parseWebhookResponse(raw) {
  const item = Array.isArray(raw) ? raw[0] : raw;

  // The output field may be a nested JSON string with code fences
  let outputStr = item?.output ?? "";
  let parsed = safeParseJSON(outputStr);

  // Sometimes it's double-wrapped: parsed.output exists
  const inner = parsed?.output ?? parsed ?? {};

  const infoCollected = inner?.infoCollected === true;

  // Human-readable message for the chat bubble
  const chatMessage = inner?.researchData?.output
    ?? inner?.output
    ?? (typeof outputStr === "string" && !outputStr.startsWith("{") ? outputStr : null)
    ?? "";

  // The itinerary from Agent 2 — a markdown string
  const itineraryMarkdown = inner?.itinerary ?? null;

  // Structured data
  const flights   = safeArray(inner?.flights   ?? inner?.options?.flights);
  const hotels    = safeArray(inner?.hotels    ?? inner?.options?.hotels);
  const citations = safeArray(inner?.citations);
  const budget    = (typeof inner?.budget_summary === "object" && !Array.isArray(inner?.budget_summary))
    ? inner.budget_summary : null;
  const weather   = (typeof inner?.weather === "object" && !Array.isArray(inner?.weather))
    ? inner.weather : null;

  return { infoCollected, chatMessage, itineraryMarkdown, flights, hotels, citations, budget, weather };
}

// Parse history messages from Postgres into chat bubbles
function parseHistoryMessages(rows) {
  if (!Array.isArray(rows)) return [];
  const result = [];
  for (const row of rows) {
    const msg = row.message ?? row;
    const role = msg.type === "human" ? "user"
      : msg.type === "ai" ? "assistant" : (msg.role ?? "assistant");

    let content = msg.content ?? msg.text ?? "";

    // AI messages contain stringified JSON — extract the readable part
    if (role === "assistant" && typeof content === "string" && content.trim().startsWith("{")) {
      const p = safeParseJSON(content);
      const inner = p?.output ?? p ?? {};
      const readable = inner?.researchData?.output ?? inner?.output ?? "";
      const itin = inner?.itinerary ?? null;
      if (readable) content = readable;
      else if (itin && typeof itin === "string") content = "✈ Your itinerary is ready — see the panel →";
      else content = "";
    }

    if (!content) continue;
    result.push({ role, content, ts: row.created_at ?? null, sessionId: row.session_id });
  }
  return result;
}

// Simple markdown → HTML renderer for itinerary
function markdownToHtml(md) {
  if (!md || typeof md !== "string") return "";
  return md
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    // tables
    .replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g, (_, header, body) => {
      const ths = header.split("|").filter(c=>c.trim()).map(c=>`<th>${c.trim()}</th>`).join("");
      const rows = body.trim().split("\n").map(row => {
        const tds = row.split("|").filter(c=>c.trim()).map(c=>`<td>${c.trim()}</td>`).join("");
        return `<tr>${tds}</tr>`;
      }).join("");
      return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    .replace(/^---+$/gm, "<hr>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^\* (.+)$/gm, "<li>$1</li>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[huplt]|<\/[huplt])(.+)$/gm, "<p>$1</p>")
    .replace(/<p><\/p>/g, "");
}

// ─── SMALL PIECES ─────────────────────────────────────────────
function Spinner({ size = 13, color = T.accent }) {
  return <div className="spin" style={{
    width:size, height:size, borderRadius:"50%",
    border:`1.5px solid ${color}25`, borderTopColor:color,
    display:"inline-block", flexShrink:0,
    animation:"spin .75s linear infinite",
  }} />;
}

function Mono({ children, color = T.muted, size = ".65rem" }) {
  return <span style={{ fontFamily:T.mono, fontSize:size, color }}>{children}</span>;
}

function Bar({ pct, color = T.accent, height = 2 }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 80); return () => clearTimeout(t); }, [pct]);
  return (
    <div style={{ height, borderRadius:2, background:T.border, overflow:"hidden" }}>
      <div style={{
        height:"100%", borderRadius:2, background:color,
        width:`${w}%`, transition:"width .55s cubic-bezier(.4,0,.2,1)",
        boxShadow:`0 0 6px ${color}40`,
      }} />
    </div>
  );
}

// ─── PIPELINE CARD (inline in chat) ───────────────────────────
function PipelineCard({ stageStatus }) {
  const done = STAGES.filter(s => stageStatus[s.id] === "done").length;
  const pct  = Math.round(done / STAGES.length * 100);
  return (
    <div className="fade-up" style={{
      margin:"10px 0 14px", padding:"13px 14px",
      background:T.surface, borderRadius:10,
      border:`1px solid ${T.border}`, maxWidth:340,
    }}>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:9 }}>
        <span style={{ fontSize:".72rem", fontWeight:600, color:T.sub }}>
          Building your trip
        </span>
        <Mono color={T.accent} size=".68rem">{pct}%</Mono>
      </div>
      <Bar pct={pct} height={3} />
      <div style={{ marginTop:9, display:"flex", flexDirection:"column", gap:3 }}>
        {STAGES.map(s => {
          const st = stageStatus[s.id] || "idle";
          return (
            <div key={s.id} style={{
              display:"flex", alignItems:"center", gap:8,
              padding:"5px 7px", borderRadius:6, transition:"all .2s",
              background: st==="active" ? `${T.accent}10` : "transparent",
              border: `1px solid ${st==="active" ? T.accent+"30" : "transparent"}`,
              opacity: st==="idle" ? .3 : 1,
            }}>
              <span style={{
                fontFamily:T.mono, fontSize:".7rem", width:14,
                color: st==="done" ? T.green : st==="active" ? T.accent : T.muted,
              }}>
                {st==="done" ? "✓" : st==="active" ? "▸" : s.icon}
              </span>
              <span style={{
                fontSize:".72rem", fontWeight:600,
                color: st==="done" ? T.sub : st==="active" ? T.ink : T.muted,
                flex:1,
              }}>{s.label}</span>
              {st==="active" && <Spinner size={11} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FLIGHT CARD ──────────────────────────────────────────────
function FlightCard({ f }) {
  const dur = f.total_duration
    ? `${Math.floor(f.total_duration/60)}h ${f.total_duration%60}m` : null;
  const airline = f.airline ?? f.flights?.[0]?.airline ?? "Flight";
  const stops   = f.stops ?? 0;
  return (
    <div style={{
      padding:"11px 13px", borderRadius:9, marginBottom:7,
      background:T.card, border:`1px solid ${T.border}`,
    }}
      onMouseEnter={e=>e.currentTarget.style.borderColor=T.borderHi}
      onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}
    >
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", gap:10 }}>
        <div>
          <div style={{ fontSize:".82rem", fontWeight:700,
            color:T.ink, marginBottom:4 }}>{airline}</div>
          <div style={{ display:"flex", gap:8 }}>
            {dur && <Mono color={T.sub}>{dur}</Mono>}
            <Mono color={T.muted}>{stops===0?"direct":`${stops} stop${stops>1?"s":""}`}</Mono>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column",
          alignItems:"flex-end", gap:7, flexShrink:0 }}>
          <span style={{ fontFamily:T.mono, fontSize:".9rem",
            color:T.gold, fontWeight:700 }}>
            ₹{f.price?.toLocaleString()}
          </span>
          {f.links?.best_link && (
            <a href={f.links.best_link} target="_blank" rel="noreferrer"
              className="book-btn" style={{ background:T.accent, color:"#fff" }}>
              ↗ Book
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── HOTEL CARD ───────────────────────────────────────────────
function HotelCard({ h }) {
  const price = h.price_per_night_num
    ?? parseFloat(String(h.lowest ?? h.rate_per_night?.lowest ?? "0").replace(/[^0-9.]/g,"")) ?? 0;
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderRadius:9, marginBottom:7,
      background:T.card, border:`1px solid ${T.border}`,
      overflow:"hidden", transition:"border-color .15s",
    }}
      onMouseEnter={e=>e.currentTarget.style.borderColor=T.borderHi}
      onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}
    >
      <div style={{ padding:"11px 13px", cursor:"pointer",
        display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", gap:10 }}
        onClick={()=>setOpen(p=>!p)}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:".82rem", fontWeight:700,
            color:T.ink, marginBottom:4 }}>{h.name}</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {h.overall_rating && <Mono color={T.gold}>⭐ {h.overall_rating}</Mono>}
            {h.stars && <Mono color={T.muted}>{h.stars}★</Mono>}
            {h.neighborhood && <Mono color={T.muted}>{h.neighborhood}</Mono>}
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column",
          alignItems:"flex-end", gap:5, flexShrink:0 }}>
          <div style={{ fontFamily:T.mono, fontSize:".88rem",
            color:T.green, fontWeight:700 }}>
            ₹{Math.round(price).toLocaleString()}
          </div>
          <Mono color={T.muted}>/night</Mono>
          <span style={{ fontFamily:T.mono, fontSize:".6rem", color:T.muted }}>
            {open ? "▲" : "▼"}
          </span>
        </div>
      </div>
      {open && (
        <div className="fade-up" style={{
          padding:"0 13px 11px", display:"flex", gap:6, flexWrap:"wrap",
          borderTop:`1px solid ${T.border}`, paddingTop:10,
        }}>
          {h.links?.best_link && (
            <a href={h.links.best_link} target="_blank" rel="noreferrer"
              className="book-btn" style={{ background:T.green, color:T.bg }}>↗ Book</a>
          )}
          {h.links?.booking_com && (
            <a href={h.links.booking_com} target="_blank" rel="noreferrer"
              className="book-btn"
              style={{ background:T.surface, color:T.sub, border:`1px solid ${T.border}` }}>
              Booking.com
            </a>
          )}
          {h.links?.google_maps && (
            <a href={h.links.google_maps} target="_blank" rel="noreferrer"
              className="book-btn"
              style={{ background:T.surface, color:T.sub, border:`1px solid ${T.border}` }}>
              📍 Maps
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── BUDGET PANEL ─────────────────────────────────────────────
function BudgetPanel({ budget }) {
  if (!budget?.limits) return (
    <Empty icon="💰" text="Budget breakdown will appear after your trip is planned." />
  );
  const total = budget.total_budget || 1;
  const costs = budget.estimated_costs ?? {};
  const rows = [
    { l:"Flights",    v: costs.flight     ?? budget.limits.flightLimit,   c:T.accent  },
    { l:"Hotels",     v: costs.hotel      ?? budget.limits.hotelLimit,     c:T.green   },
    { l:"Activities", v: costs.activities ?? budget.limits.activityLimit,  c:T.purple  },
    { l:"Meals",      v: costs.meals      ?? budget.limits.mealLimit,      c:T.orange  },
  ];
  const hc = budget.health_score==="Excellent" ? T.green
    : budget.health_score==="Good" ? T.accent
    : budget.health_score==="Tight" ? T.orange : T.red;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:14 }}>
        <span style={{ fontSize:".82rem", fontWeight:700, color:T.ink }}>
          Budget Breakdown
        </span>
        <span style={{
          fontFamily:T.mono, fontSize:".63rem", fontWeight:600,
          padding:"3px 9px", borderRadius:20,
          background:`${hc}18`, color:hc, border:`1px solid ${hc}30`,
        }}>{budget.health_score ?? "—"}</span>
      </div>

      <div style={{ background:T.surface, borderRadius:9, padding:"11px 13px",
        marginBottom:14, border:`1px solid ${T.border}` }}>
        {[
          ["Total budget",    `₹${total.toLocaleString()}`,                    T.ink  ],
          ["Est. spend",      `₹${(budget.estimated_total??0).toLocaleString()}`, T.gold ],
          ["Remaining",       `₹${(budget.remaining??0).toLocaleString()}`,    T.green],
        ].map(([l,v,c])=>(
          <div key={l} style={{ display:"flex", justifyContent:"space-between",
            padding:"4px 0", borderBottom:`1px solid ${T.border}` }}>
            <Mono color={T.sub}>{l}</Mono>
            <Mono color={c} size=".7rem">{v}</Mono>
          </div>
        ))}
      </div>

      {rows.map((r,i)=>(
        <div key={i} style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <Mono color={T.sub}>{r.l}</Mono>
            <Mono color={r.c} size=".7rem">₹{Math.round(r.v).toLocaleString()}</Mono>
          </div>
          <Bar pct={Math.min(100,Math.round(r.v/total*100))} color={r.c} height={3} />
        </div>
      ))}
      {budget.health_advice && (
        <div style={{ marginTop:12, padding:"9px 11px", borderRadius:8,
          background:T.surface, border:`1px solid ${T.border}`,
          fontSize:".72rem", color:T.sub, lineHeight:1.65 }}>
          {budget.health_advice}
        </div>
      )}
      {budget.warnings?.length > 0 && (
        <div style={{ marginTop:8 }}>
          {budget.warnings.map((w,i)=>(
            <div key={i} style={{ fontSize:".68rem", color:T.orange,
              padding:"5px 9px", borderRadius:6, background:`${T.orange}10`,
              border:`1px solid ${T.orange}25`, marginBottom:4 }}>
              ⚠ {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── WEATHER PANEL ────────────────────────────────────────────
function WeatherPanel({ weather }) {
  if (!weather?.daily?.length) return (
    <Empty icon="🌤" text="Weather forecast will appear after your trip is planned." />
  );
  return (
    <div>
      <div style={{ fontSize:".82rem", fontWeight:700, color:T.ink, marginBottom:12 }}>
        Weather Forecast
      </div>
      {weather.trip_summary?.overall_advice && (
        <div style={{ fontSize:".74rem", color:T.sub, lineHeight:1.65, marginBottom:12 }}>
          {weather.trip_summary.overall_advice}
        </div>
      )}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {weather.daily.map((d,i)=>(
          <div key={i} style={{
            flex:"1 1 55px", minWidth:55, padding:"10px 6px",
            borderRadius:9, textAlign:"center",
            background:T.surface, border:`1px solid ${T.border}`,
          }}>
            <Mono color={T.muted} size=".6rem">D{d.day_number}</Mono>
            <div style={{ fontSize:20, margin:"5px 0" }}>
              {d.has_rain ? "🌧" : d.avg_temp_c>30 ? "☀️" : "⛅"}
            </div>
            <div style={{ fontFamily:T.mono, fontSize:".72rem",
              color:T.gold, fontWeight:700 }}>{d.avg_temp_c}°</div>
            <div style={{ fontSize:".58rem", color:T.muted, marginTop:2,
              fontFamily:T.mono }}>
              {d.condition?.split(" ").slice(0,2).join(" ")}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:6 }}>
        {weather.daily.map((d,i)=>d.packing_tip && (
          <div key={i} style={{ display:"flex", gap:8, fontSize:".7rem",
            color:T.sub, lineHeight:1.5 }}>
            <Mono color={T.accent} size=".65rem">D{d.day_number}</Mono>
            <span>{d.packing_tip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ITINERARY PANEL ──────────────────────────────────────────
function ItineraryPanel({ markdown }) {
  if (!markdown) return (
    <Empty icon="🗺" text="Your day-by-day itinerary will appear here after planning." />
  );

  // Split into sections by ## Day headings
  const sections = [];
  const lines = markdown.split("\n");
  let currentSection = { title:"Overview", lines:[] };

  for (const line of lines) {
    if (line.match(/^## Day \d+/i)) {
      if (currentSection.lines.some(l=>l.trim())) {
        sections.push(currentSection);
      }
      currentSection = { title: line.replace(/^## /, ""), lines:[] };
    } else {
      currentSection.lines.push(line);
    }
  }
  if (currentSection.lines.some(l=>l.trim())) sections.push(currentSection);

  return <SectionAccordion sections={sections} />;
}

function SectionAccordion({ sections }) {
  const [open, setOpen] = useState(0);
  return (
    <div>
      {sections.map((sec, i) => {
        const isDaySection = sec.title.match(/^Day \d+/i);
        const dayNum = isDaySection ? sec.title.match(/\d+/)?.[0] : null;
        const isOpen = open === i;
        const html = markdownToHtml(sec.lines.join("\n"));

        return (
          <div key={i} style={{ marginBottom:7 }}>
            <button className={`day-toggle${isOpen?" open":""}`}
              onClick={()=>setOpen(isOpen ? -1 : i)}>
              <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                {dayNum && (
                  <span style={{
                    fontFamily:T.mono, fontSize:".62rem", fontWeight:700,
                    padding:"2px 7px", borderRadius:4,
                    background:`${T.accent}18`, color:T.accent,
                  }}>DAY {dayNum}</span>
                )}
                <span style={{ fontSize:".8rem", fontWeight:600, color:T.ink }}>
                  {isDaySection
                    ? sec.title.replace(/^Day \d+ — ?/i,"").replace(/^Day \d+$/i,"")
                    : sec.title}
                </span>
              </div>
              <span style={{ fontFamily:T.mono, fontSize:".6rem", color:T.muted }}>
                {isOpen?"▲":"▼"}
              </span>
            </button>
            {isOpen && (
              <div className="fade-up itin-body" style={{
                padding:"14px 14px", background:T.surface,
                borderRadius:"0 0 9px 9px",
                border:`1px solid ${T.borderHi}`, borderTop:"none",
              }}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── EMPTY STATE ──────────────────────────────────────────────
function Empty({ icon, text }) {
  return (
    <div style={{ padding:"50px 20px", textAlign:"center" }}>
      <div style={{ fontSize:32, marginBottom:10, opacity:.15 }}>{icon}</div>
      <div style={{ fontSize:".76rem", color:T.muted, lineHeight:1.75 }}>{text}</div>
    </div>
  );
}

// ─── RIGHT PANEL ──────────────────────────────────────────────
function RightPanel({ liveData }) {
  const [tab, setTab] = useState("itinerary");
  const hasFlights = liveData.flights?.length > 0;
  const hasHotels  = liveData.hotels?.length > 0;

  const tabs = [
    { id:"itinerary", label:"Itinerary" },
    { id:"flights",   label: hasFlights ? `Flights (${liveData.flights.length})` : "Flights" },
    { id:"hotels",    label: hasHotels  ? `Hotels (${liveData.hotels.length})`   : "Hotels"  },
    { id:"budget",    label:"Budget"    },
    { id:"weather",   label:"Weather"   },
  ];

  return (
    <div style={{
      width:390, flexShrink:0, display:"flex",
      flexDirection:"column", height:"100%",
      borderLeft:`1px solid ${T.border}`, background:T.panel,
    }}>
      <div style={{
        padding:"12px 14px", borderBottom:`1px solid ${T.border}`, flexShrink:0,
      }}>
        <div style={{ fontFamily:T.mono, fontSize:".6rem", color:T.muted,
          letterSpacing:".1em", textTransform:"uppercase", marginBottom:9 }}>
          Trip Details
        </div>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {tabs.map(t=>(
            <button key={t.id}
              className={`tab-btn${tab===t.id?" active":""}`}
              onClick={()=>setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"14px" }}>
        <div className="fade-up" key={tab}>
          {tab==="itinerary" && <ItineraryPanel markdown={liveData.itineraryMarkdown} />}
          {tab==="flights" && (
            hasFlights
              ? liveData.flights.map((f,i)=><FlightCard key={i} f={f} />)
              : <Empty icon="✈" text="No flights found for this trip." />
          )}
          {tab==="hotels" && (
            hasHotels
              ? liveData.hotels.map((h,i)=><HotelCard key={i} h={h} />)
              : <Empty icon="🏨" text="No hotels found for this trip." />
          )}
          {tab==="budget" && <BudgetPanel budget={liveData.budget} />}
          {tab==="weather" && <WeatherPanel weather={liveData.weather} />}
        </div>
      </div>
    </div>
  );
}

// ─── CHAT BUBBLE ──────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className="fade-up" style={{
      display:"flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom:12, gap:8, alignItems:"flex-end",
    }}>
      {!isUser && (
        <div style={{
          width:26, height:26, borderRadius:7, flexShrink:0,
          background:`linear-gradient(135deg, ${T.accent}, ${T.purple})`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:12, marginBottom:2,
        }}>✈</div>
      )}
      <div style={{ maxWidth:"82%", minWidth:0 }}>
        <div style={{
          padding:"10px 14px",
          borderRadius: isUser ? "14px 14px 3px 14px" : "3px 14px 14px 14px",
          background: isUser
            ? `linear-gradient(135deg, ${T.accent}dd, ${T.purple}cc)`
            : T.card,
          border: isUser ? "none" : `1px solid ${T.border}`,
          fontSize:".84rem", lineHeight:1.78,
          color: isUser ? "#fff" : T.ink,
          whiteSpace:"pre-wrap", wordBreak:"break-word",
        }}>{msg.content}</div>
        {msg.ts && (
          <div style={{ fontSize:".58rem", color:T.muted,
            fontFamily:T.mono, marginTop:3,
            textAlign: isUser ? "right" : "left" }}>
            {new Date(msg.ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
          </div>
        )}
      </div>
      {isUser && (
        <div style={{
          width:26, height:26, borderRadius:7, flexShrink:0,
          background:T.surface, border:`1px solid ${T.border}`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:12, marginBottom:2,
        }}>🧑</div>
      )}
    </div>
  );
}

function Typing() {
  return (
    <div className="fade-up" style={{
      display:"flex", alignItems:"center", gap:5,
      padding:"10px 14px", borderRadius:"3px 14px 14px 14px",
      background:T.card, border:`1px solid ${T.border}`,
      width:"fit-content", marginBottom:12,
    }}>
      {[0,1,2].map(i=>(
        <div key={i} style={{
          width:6, height:6, borderRadius:"50%", background:T.muted,
          animation:`blink 1.1s ${i*.18}s ease-in-out infinite`,
        }}/>
      ))}
    </div>
  );
}

// ─── CHAT HISTORY SIDEBAR ─────────────────────────────────────
function HistorySidebar({ sessions, currentId, onSelect, onNew }) {
  return (
    <div style={{
      width:220, flexShrink:0, display:"flex",
      flexDirection:"column", height:"100%",
      borderRight:`1px solid ${T.border}`, background:T.panel,
    }}>
      {/* Logo */}
      <div style={{
        padding:"13px 14px", borderBottom:`1px solid ${T.border}`, flexShrink:0,
        display:"flex", alignItems:"center", gap:9,
      }}>
        <div style={{
          width:30, height:30, borderRadius:8, flexShrink:0,
          background:`linear-gradient(135deg, ${T.accent}, ${T.purple})`,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:14,
        }}>✈</div>
        <div>
          <div style={{ fontSize:".82rem", fontWeight:800,
            letterSpacing:".07em", color:T.ink }}>WANDR</div>
          <div style={{ fontFamily:T.mono, fontSize:".52rem",
            color:T.muted, letterSpacing:".1em" }}>AI TRAVEL</div>
        </div>
      </div>

      {/* New chat */}
      <div style={{ padding:"10px 12px 6px" }}>
        <button onClick={onNew} style={{
          width:"100%", padding:"7px 10px", borderRadius:8,
          background:"transparent", border:`1px dashed ${T.border}`,
          color:T.sub, fontSize:".72rem", fontWeight:600,
          cursor:"pointer", display:"flex", alignItems:"center", gap:6,
          transition:"all .15s",
        }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.color=T.ink;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.sub;}}
        >
          <span style={{ fontSize:15, lineHeight:1 }}>+</span> New trip
        </button>
      </div>

      {/* Sessions */}
      <div style={{ flex:1, overflowY:"auto", padding:"4px 10px 16px" }}>
        {sessions.length===0 ? (
          <div style={{ padding:"18px 4px", fontSize:".68rem",
            color:T.muted, lineHeight:1.7 }}>
            Your past trips will appear here.
          </div>
        ) : sessions.map(s=>(
          <div key={s.id}
            className={`chat-item${s.id===currentId?" active":""}`}
            onClick={()=>onSelect(s.id)}
          >
            <div style={{ fontSize:14, flexShrink:0, marginTop:1 }}>🌍</div>
            <div style={{ minWidth:0 }}>
              <div style={{
                fontSize:".74rem", fontWeight:600, color:T.ink,
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
              }}>{s.label}</div>
              <Mono color={T.muted} size=".58rem">{s.id.slice(-10)}</Mono>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding:"9px 14px", borderTop:`1px solid ${T.border}` }}>
        <Mono color={T.muted} size=".58rem">·· {currentId.slice(-12)}</Mono>
      </div>
    </div>
  );
}

// ─── SUGGESTIONS ──────────────────────────────────────────────
const SUGGESTIONS = [
  "5 days Tokyo, ₹1,50,000 — culture & food",
  "3 days Dubai, ₹1,00,000 — luxury",
  "Weekend Bali, ₹80,000 — adventure",
];

// ─── MAIN APP ─────────────────────────────────────────────────
export default function App() {
  const [messages,     setMessages]     = useState([]);
  const [input,        setInput]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [stageStatus,  setStageStatus]  = useState({});
  const [liveData,     setLiveData]     = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessions,     setSessions]     = useState([]);

  const [sessionId, setSessionId] = useState(() => {
    const s = localStorage.getItem("wandr_session");
    if (s) return s;
    const f = `session_${Date.now()}`;
    localStorage.setItem("wandr_session", f);
    return f;
  });

  const chatRef   = useRef(null);
  const inputRef  = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading, isProcessing]);

  // Load saved sessions list
  useEffect(() => {
    try {
      const raw = localStorage.getItem("wandr_sessions");
      if (raw) setSessions(JSON.parse(raw));
    } catch {}
  }, []);

  // Fetch history for current session
  useEffect(() => {
    async function load() {
      setMessages([]);
      setLiveData({});
      try {
        const res = await fetch(`${N8N_HISTORY}?sessionId=${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        const msgs = parseHistoryMessages(Array.isArray(data) ? data : (data.messages ?? []));
        if (msgs.length) setMessages(msgs);
      } catch {}
    }
    load();
  }, [sessionId]);

  // Pipeline simulation
  const simulatePipeline = useCallback(async () => {
    setIsProcessing(true);
    setStageStatus({});
    let cancelled = false;
    cancelRef.current = () => { cancelled = true; };
    for (const stage of STAGES) {
      if (cancelled) break;
      setStageStatus(prev => ({ ...prev, [stage.id]: "active" }));
      await sleep(STAGE_MS[stage.id] ?? 3000);
      if (cancelled) break;
      setStageStatus(prev => ({ ...prev, [stage.id]: "done" }));
    }
  }, []);

  const endPipeline = useCallback(() => {
    if (cancelRef.current) cancelRef.current();
    setStageStatus(prev => {
      const n = { ...prev };
      STAGES.forEach(s => { if (n[s.id] === "active") n[s.id] = "done"; });
      return n;
    });
    setIsProcessing(false);
  }, []);

  const saveSession = useCallback((sid, label) => {
    setSessions(prev => {
      if (prev.find(s=>s.id===sid)) return prev;
      const updated = [{ id:sid, label:label.slice(0,32)+(label.length>32?"…":"") }, ...prev];
      localStorage.setItem("wandr_sessions", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg = { role:"user", content:text, ts:Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    saveSession(sessionId, text);

    try {
      const res = await fetch(N8N_WEBHOOK, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ chatInput:text, sessionId, action:"sendMessage" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();

      const { infoCollected, chatMessage, itineraryMarkdown,
              flights, hotels, citations, budget, weather } = parseWebhookResponse(raw);

      if (!infoCollected) {
        setMessages(prev => [...prev, {
          role:"assistant",
          content: chatMessage || "Could you share your trip details?",
          ts:Date.now(),
        }]);
      } else {
        simulatePipeline();

        const live = {};
        if (flights.length)    live.flights            = flights;
        if (hotels.length)     live.hotels             = hotels;
        if (citations.length)  live.citations          = citations;
        if (budget)            live.budget             = budget;
        if (weather)           live.weather            = weather;
        if (itineraryMarkdown) live.itineraryMarkdown  = itineraryMarkdown;
        if (Object.keys(live).length) setLiveData(live);

        endPipeline();

        // Clean chat message — strip any JSON blob if present
        let displayMsg = chatMessage || "";
        if (!displayMsg || displayMsg.startsWith("{")) {
          displayMsg = itineraryMarkdown
            ? "Your itinerary is ready! Check the panel on the right →"
            : "Your trip has been planned. Check the panel on the right →";
        }

        setMessages(prev => [...prev, {
          role:"assistant", content:displayMsg, ts:Date.now(),
        }]);
      }
    } catch (err) {
      endPipeline();
      setMessages(prev => [...prev, {
        role:"assistant",
        content:`Something went wrong: ${err.message}`,
        ts:Date.now(),
      }]);
    }
    setLoading(false);
  }, [input, loading, sessionId, simulatePipeline, endPipeline, saveSession]);

  const handleKey = useCallback(e => {
    if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }, [send]);

  const newChat = useCallback(() => {
    const f = `session_${Date.now()}`;
    localStorage.setItem("wandr_session", f);
    setSessionId(f);
    setLiveData({});
    setStageStatus({});
    setIsProcessing(false);
  }, []);

  const activeStage = STAGES.find(s => stageStatus[s.id]==="active");

  return (
    <>
      <style>{CSS}</style>
      <div style={{ display:"flex", height:"100vh", width:"100%",
        background:T.bg, overflow:"hidden" }}>

        {/* LEFT: History */}
        <HistorySidebar
          sessions={sessions}
          currentId={sessionId}
          onSelect={id=>{ localStorage.setItem("wandr_session",id); setSessionId(id); }}
          onNew={newChat}
        />

        {/* MIDDLE: Chat */}
        <div style={{ flex:1, display:"flex", flexDirection:"column",
          overflow:"hidden", minWidth:0, borderRight:`1px solid ${T.border}` }}>

          {/* Top bar */}
          <div style={{
            height:48, borderBottom:`1px solid ${T.border}`,
            display:"flex", alignItems:"center", padding:"0 18px",
            flexShrink:0, background:T.panel, gap:9,
          }}>
            {isProcessing && <Spinner size={12} />}
            <span style={{ fontSize:".74rem", color:T.sub, fontWeight:600 }}>
              {isProcessing ? (activeStage?.label ?? "Planning…") : "Chat"}
            </span>
          </div>

          {/* Messages */}
          <div ref={chatRef} style={{ flex:1, overflowY:"auto", padding:"18px 18px 6px" }}>

            {messages.length===0 && !loading && (
              <div style={{ height:"100%", display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center", gap:18 }}>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:"1rem", fontWeight:700, color:T.ink, marginBottom:8 }}>
                    Where next?
                  </div>
                  <div style={{ fontSize:".8rem", color:T.sub, lineHeight:1.75, maxWidth:300 }}>
                    Share your destination, dates, budget and travel style.
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"center" }}>
                  {SUGGESTIONS.map((s,i)=>(
                    <button key={i}
                      onClick={()=>{ setInput(s); inputRef.current?.focus(); }}
                      style={{
                        padding:"6px 12px", borderRadius:20,
                        background:T.surface, border:`1px solid ${T.border}`,
                        color:T.sub, fontSize:".72rem", cursor:"pointer",
                        fontFamily:T.sans, transition:"all .15s",
                      }}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.color=T.ink;}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.sub;}}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m,i) => <Bubble key={i} msg={m} />)}

            {/* Pipeline inline after messages */}
            {isProcessing && <PipelineCard stageStatus={stageStatus} />}

            {loading && !isProcessing && <Typing />}
          </div>

          {/* Input */}
          <div style={{ borderTop:`1px solid ${T.border}`,
            padding:"11px 15px 15px", background:T.panel, flexShrink:0 }}>
            <div style={{
              display:"flex", gap:8, alignItems:"flex-end",
              background:T.card, border:`1px solid ${T.border}`,
              borderRadius:12, padding:"9px 11px",
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={loading}
                rows={1}
                placeholder={messages.length===0
                  ? "e.g. 5 days Tokyo, ₹1,50,000, love food & culture"
                  : "Type your message…"}
                style={{
                  flex:1, background:"transparent", border:"none",
                  outline:"none", resize:"none", overflow:"hidden",
                  color: loading ? T.muted : T.ink,
                  fontSize:".85rem", lineHeight:1.6,
                  fontFamily:T.sans, minHeight:24, maxHeight:120,
                  caretColor:T.accent,
                }}
              />
              <button onClick={send} disabled={loading||!input.trim()}
                style={{
                  width:33, height:33, borderRadius:8, flexShrink:0,
                  background: loading||!input.trim()
                    ? T.border
                    : `linear-gradient(135deg,${T.accent},${T.purple})`,
                  border:"none",
                  cursor: loading||!input.trim() ? "not-allowed" : "pointer",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:"#fff", fontSize:15, transition:"all .2s",
                  alignSelf:"flex-end",
                }}>
                {loading ? <Spinner size={13} color="#fff" /> : "↑"}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Trip details */}
        <RightPanel liveData={liveData} />
      </div>
    </>
  );
}