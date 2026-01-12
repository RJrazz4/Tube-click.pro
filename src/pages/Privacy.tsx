import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto py-12">
      <Link to="/">
        <Button variant="ghost" className="mb-8 gap-2">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Home
        </Button>
      </Link>

      <h1 className="text-4xl font-bold mb-8 font-display">Privacy Policy</h1>
      
      <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground">
        <p className="text-sm">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Introduction</h2>
          <p>
            TubeGenius Pro ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we handle information when you use our web application.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Data We Collect</h2>
          <p>
            <strong className="text-foreground">We do NOT store any user data on our servers.</strong> TubeGenius Pro operates entirely in your browser. All data, including your API keys and generated content, is stored locally on your device using your browser's LocalStorage.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">LocalStorage Usage</h2>
          <p>
            We use your browser's LocalStorage to save:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Your API keys (encrypted and stored locally on your device only)</li>
            <li>Generated content history for your convenience</li>
            <li>Application preferences and settings</li>
          </ul>
          <p>
            This data never leaves your device unless you explicitly choose to export it. You can clear this data at any time by clearing your browser's local storage.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Third-Party Services</h2>
          <p>
            TubeGenius Pro integrates with third-party APIs to provide AI-powered features:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong className="text-foreground">Google AI (Gemini)</strong> – For content generation and image analysis</li>
            <li><strong className="text-foreground">OpenAI</strong> – For advanced text generation capabilities</li>
            <li><strong className="text-foreground">ElevenLabs</strong> – For voice synthesis features</li>
          </ul>
          <p>
            When you use these features, your prompts and content are sent directly to these third-party services using your own API keys. Please review their respective privacy policies for information on how they handle your data.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Cookies</h2>
          <p>
            We do not use cookies for tracking purposes. Any cookies present are essential for the basic functionality of the application.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Data Security</h2>
          <p>
            Since all data is stored locally on your device, you are in control of your data security. We recommend:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Using a secure, up-to-date browser</li>
            <li>Not sharing your device with untrusted parties</li>
            <li>Regularly clearing sensitive data from LocalStorage if needed</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Any changes will be reflected on this page with an updated revision date.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please reach out to us through our website.
          </p>
        </section>
      </div>
    </div>
  );
}
