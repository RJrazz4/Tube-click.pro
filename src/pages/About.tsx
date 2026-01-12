import { ArrowLeft, Sparkles, Globe, Heart } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function About() {
  return (
    <div className="max-w-3xl mx-auto py-12">
      <Link to="/">
        <Button variant="ghost" className="mb-8 gap-2">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Home
        </Button>
      </Link>

      <h1 className="text-4xl font-bold mb-4 font-display">Empowering Creators with AI</h1>
      <p className="text-xl text-primary mb-12">Building the future of content creation</p>
      
      <div className="space-y-12">
        <section className="space-y-4">
          <p className="text-lg text-muted-foreground leading-relaxed">
            TubeGenius Pro is a <strong className="text-foreground">non-profit tool</strong> designed to help Indian creators compete globally using the power of Artificial Intelligence. We believe that every creator, regardless of their resources, deserves access to professional-grade AI tools.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="p-6 rounded-xl border border-border/50 bg-card/30">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-primary" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">AI-Powered</h3>
            <p className="text-sm text-muted-foreground">
              Leverage cutting-edge AI models to generate scripts, thumbnails, voiceovers, and more.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border/50 bg-card/30">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Globe className="w-6 h-6 text-primary" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Global Reach</h3>
            <p className="text-sm text-muted-foreground">
              Create content that resonates with audiences worldwide with professional quality.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border/50 bg-card/30">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Heart className="w-6 h-6 text-primary" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Creator-First</h3>
            <p className="text-sm text-muted-foreground">
              Built by creators, for creators. Your success is our mission.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Our Mission</h2>
          <p className="text-muted-foreground leading-relaxed">
            We started TubeGenius Pro with a simple goal: to democratize access to AI tools for content creators. Large studios and established creators have access to expensive tools and teams. We want to level the playing field by giving independent creators the same powerful capabilities – for free.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">How It Works</h2>
          <p className="text-muted-foreground leading-relaxed">
            TubeGenius Pro uses a "Bring Your Own Key" (BYOK) model. You provide your own API keys from providers like Google AI, OpenAI, or ElevenLabs, and our platform provides the interface and tools to use them effectively. This means you only pay for what you use – directly to the API providers – with no middleman fees.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Privacy First</h2>
          <p className="text-muted-foreground leading-relaxed">
            Your data stays on your device. We don't store your API keys, scripts, or generated content on any server. Everything runs locally in your browser, giving you complete control and privacy over your creative work.
          </p>
        </section>

        <section className="p-6 rounded-xl border border-primary/30 bg-primary/5 text-center">
          <p className="text-lg text-foreground">
            Made with ❤️ for creators everywhere
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Join thousands of creators already using TubeGenius Pro
          </p>
        </section>
      </div>
    </div>
  );
}
