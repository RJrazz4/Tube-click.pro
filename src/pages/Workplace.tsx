import { useState } from "react";
import { PenLine, Send, CheckCircle2, MessageCircle, Crown, Loader2, ShieldCheck, Clock3, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// KAAM KARWAO — Website Workplace (RazzScale AI ka dusra darwaza).
// Order seedha usi system me jata hai jo WhatsApp par chalta hai:
// kaam banta hai -> quality jaanch (Boss approval) -> delivery WhatsApp par.
// Bhaari kaam (bot/website/automation) yahan nahi banta — woh VIP rasta hai.
const BOT_API = (import.meta as any).env?.VITE_BOT_API_URL || "https://razzscale-botfather.onrender.com";

const KINDS = [
  { key: "work_k1", label: "Caption", hint: "Social media post ke liye" },
  { key: "work_k2", label: "Business Message", hint: "WhatsApp par bhejne ke liye" },
  { key: "work_k3", label: "Product Description", hint: "Product ki tafseel" },
  { key: "work_k4", label: "Chhoti Script", hint: "Video / reel ke liye" },
  { key: "work_k5", label: "Kuch Aur Likhai", hint: "Jo bhi likhwana ho" },
];

type DoneState =
  | { type: "success"; orderId: string; message: string; waLink: string }
  | { type: "heavy"; message: string; waLink: string };

export default function Workplace() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState("work_k1");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<DoneState | null>(null);

  async function submit() {
    setError("");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { setError("Sahi WhatsApp number do — taiyaar kaam isi number par milega."); return; }
    if (brief.trim().length < 10) { setError("Kaam ki tafseel thodi aur batao — kiske liye hai, kya khaas baat aani chahiye?"); return; }
    setBusy(true);
    try {
      const res = await fetch(`${BOT_API}/web/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: digits, kind, brief: brief.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.heavy) { setDone({ type: "heavy", message: j.message || "", waLink: j.waLink || "" }); return; }
      if (!res.ok || !j?.ok) { setError(j?.error || "Order nahi lag paya — ek minute me dobara try karo."); return; }
      setDone({ type: "success", orderId: j.orderId, message: j.message || "", waLink: j.waLink || "" });
    } catch {
      setError("Server se jud nahi paya — internet check karke dobara try karo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-4">
          <PenLine className="w-3.5 h-3.5" aria-hidden="true" /> RazzScale AI Workplace
        </div>
        <h1 className="text-4xl font-bold font-display mb-3">Kaam Karwao — Likhai</h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Caption, business message, product description ya chhoti script — order do,
          kaam bankar <strong className="text-foreground">tumhare WhatsApp par</strong> milega.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-10">
        {[
          { icon: ListChecks, title: "1. Order Do", text: "Kaam ki type chuno aur 1–3 line me tafseel bata do." },
          { icon: ShieldCheck, title: "2. Quality Jaanch", text: "Har kaam ek jaanch ke baad hi bheja jata hai — galat kaam nahi jayega." },
          { icon: MessageCircle, title: "3. WhatsApp Par Milega", text: "Taiyaar kaam tumhare WhatsApp number par deliver hoga." },
        ].map((s) => (
          <div key={s.title} className="p-5 rounded-xl border border-border/50 bg-card/30">
            <s.icon className="w-6 h-6 text-primary mb-3" aria-hidden="true" />
            <h3 className="font-semibold text-foreground mb-1">{s.title}</h3>
            <p className="text-sm text-muted-foreground">{s.text}</p>
          </div>
        ))}
      </div>

      {done ? (
        <div className="p-8 rounded-2xl border border-border/60 bg-card/40 text-center">
          {done.type === "success" ? (
            <>
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4" aria-hidden="true" />
              <h2 className="text-2xl font-bold mb-2">Order Mil Gaya!</h2>
              <p className="text-muted-foreground mb-1">Order ID: <strong className="text-foreground">{done.orderId}</strong></p>
              <p className="text-muted-foreground mb-6">{done.message}</p>
              <a href={done.waLink} target="_blank" rel="noreferrer">
                <Button className="gap-2">
                  <MessageCircle className="w-4 h-4" aria-hidden="true" />
                  WhatsApp Par Ek "Hi" Bhejo — Kaam Wahi Milega
                </Button>
              </a>
              <p className="text-xs text-muted-foreground mt-4 flex items-center justify-center gap-1">
                <Clock3 className="w-3.5 h-3.5" aria-hidden="true" /> Aam taur par kuch minutes lagte hain.
              </p>
            </>
          ) : (
            <>
              <Crown className="w-12 h-12 text-primary mx-auto mb-4" aria-hidden="true" />
              <h2 className="text-2xl font-bold mb-2">Ye Kaam VIP Raste Se Hoga</h2>
              <p className="text-muted-foreground mb-6">{done.message}</p>
              <a href={done.waLink} target="_blank" rel="noreferrer">
                <Button className="gap-2">
                  <MessageCircle className="w-4 h-4" aria-hidden="true" />
                  WhatsApp Par Boss Se Baat Karo
                </Button>
              </a>
            </>
          )}
          <div className="mt-6">
            <Button variant="ghost" onClick={() => { setDone(null); setBrief(""); }}>
              Ek aur order do
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-6 md:p-8 rounded-2xl border border-border/60 bg-card/40 space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="wk-name">Tumhara naam</label>
              <Input id="wk-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul Sharma" maxLength={60} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="wk-phone">WhatsApp number *</label>
              <Input id="wk-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 digit mobile number" inputMode="tel" maxLength={15} />
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium mb-2">Kya likhwana hai? *</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setKind(k.key)}
                  className={`text-left p-3 rounded-lg border transition-colors ${kind === k.key ? "border-primary bg-primary/10" : "border-border/50 bg-card/30 hover:border-primary/40"}`}
                >
                  <span className="block font-medium text-sm text-foreground">{k.label}</span>
                  <span className="block text-xs text-muted-foreground">{k.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" htmlFor="wk-brief">Kaam ki tafseel *</label>
            <Textarea
              id="wk-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              maxLength={600}
              placeholder='Example: "Meri mithaas ki dukaan ke liye Diwali offer ka caption — 20% off wali baat ke saath, khushi wala mahaul."'
            />
            <p className="text-xs text-muted-foreground mt-1">{brief.length}/600</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full gap-2" size="lg" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
            {busy ? "Order lag raha hai…" : "Order Do — Kaam Shuru Karo"}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Bot, website ya automation jaisa bhaari kaam chahiye? Woh Boss RazzScale khud banate hain —
            order me likh do, VIP rasta khud khul jayega.
          </p>
        </div>
      )}
    </div>
  );
}
