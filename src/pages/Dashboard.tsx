const navLinks = [
  "Solutions",
  "Documentation",
  "Pricing",
  "Contact Us",
  "Book an Appointment",
  "Dashboard",
];

const tags = [
  "Lead Generation",
  "Appointments",
  "Support",
  "Negotiation",
  "Collections",
];

const logos = ["Capgemini", "Exotel", "NVIDIA", "Airtel", "Axis Bank", "HDFC"];

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-[#0a0f0f] text-white">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0a0f0f]/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-xl font-semibold tracking-wide">
            <span className="rounded-full border border-emerald-400/40 px-2 py-1 text-xs text-emerald-300">
              OMNI
            </span>
            <span className="text-white/90">DIMENSION</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-white/70 lg:flex">
            {navLinks.map((link) => (
              <span key={link} className="transition hover:text-white">
                {link}
              </span>
            ))}
          </nav>
          <button className="rounded-full border border-emerald-400/40 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-emerald-300 transition hover:border-emerald-300 hover:text-emerald-200">
            Get Started
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pb-24 pt-16 text-center">
        <div className="relative mb-10 w-full max-w-3xl">
          <div className="absolute -left-32 -top-20 h-60 w-60 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute -right-24 top-20 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-white/50">
            Voice AI Platform
          </p>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl md:text-5xl">
            Create your Free Voice AI Assistant
          </h1>
          <p className="mt-4 text-sm text-white/60 sm:text-base">
            Build, test, and ship reliable voice AI assistants with natural
            conversations in minutes.
          </p>
        </div>

        <section className="w-full max-w-3xl rounded-2xl border border-emerald-400/40 bg-[#101515] p-6 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
          <div className="rounded-xl border border-emerald-500/30 bg-[#0c1212] p-4 text-left">
            <p className="text-xs uppercase tracking-wide text-emerald-300/80">
              Start by typing your requirements here
            </p>
            <textarea
              className="mt-3 h-28 w-full resize-none bg-transparent text-sm text-white/80 outline-none placeholder:text-white/30"
              placeholder="Create a voice AI agent for inbound calls, with 24/7 support and booking..."
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs text-emerald-200/80">
                <span className="flex items-center gap-2 rounded-full border border-emerald-400/30 px-3 py-1">
                  🔊 Speech Flow
                </span>
                <span className="flex items-center gap-2 rounded-full border border-emerald-400/30 px-3 py-1">
                  ⚡ Automated Prompt
                </span>
              </div>
              <button className="rounded-full bg-emerald-400 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-[#081111] transition hover:bg-emerald-300">
                Generate →
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-white/60">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
              >
                {tag}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-14 w-full text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-white/40">
            Trusted by leading companies
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm text-white/50">
            {logos.map((logo) => (
              <span key={logo} className="uppercase tracking-widest">
                {logo}
              </span>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
