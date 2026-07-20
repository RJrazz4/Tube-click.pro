import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto py-12">
      <Link to="/">
        <Button variant="ghost" className="mb-8 gap-2">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Home
        </Button>
      </Link>

      <h1 className="text-4xl font-bold mb-8 font-display">Terms of Service</h1>
      
      <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground">
        <p className="text-sm">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Agreement to Terms</h2>
          <p>
            By accessing and using TubeClick Pro, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our service.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">BYOK (Bring Your Own Key) Model</h2>
          <p>
            TubeClick Pro operates on a <strong className="text-foreground">tiered subscription</strong> model. Free users have limited daily generations, while Pro users get unlimited access to all AI features.
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>You must provide your own API keys for third-party services (Google AI, OpenAI, ElevenLabs, etc.)</li>
            <li>You are solely responsible for all API usage and associated costs incurred through your keys</li>
            <li>You must comply with the terms of service of each third-party API provider</li>
            <li>We do not have access to your API keys – they are stored locally on your device</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">User Responsibilities</h2>
          <p>
            As a user of TubeClick Pro, you agree to:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Use the service in compliance with all applicable laws and regulations</li>
            <li>Not use the service to generate harmful, illegal, or inappropriate content</li>
            <li>Take responsibility for all content you generate using the platform</li>
            <li>Safeguard your API keys and not share them with unauthorized parties</li>
            <li>Monitor your API usage and costs with third-party providers</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Intellectual Property</h2>
          <p>
            Content generated using TubeClick Pro belongs to you. You are free to use generated scripts, thumbnails, voiceovers, and other content for your YouTube channels and social media platforms.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Disclaimer of Warranties</h2>
          <p>
            TubeClick Pro is provided <strong className="text-foreground">"AS IS"</strong> and <strong className="text-foreground">"AS AVAILABLE"</strong> without warranties of any kind, either express or implied, including but not limited to:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Implied warranties of merchantability</li>
            <li>Fitness for a particular purpose</li>
            <li>Non-infringement</li>
            <li>Accuracy or reliability of any content generated</li>
          </ul>
          <p>
            We do not warrant that the service will be uninterrupted, secure, or error-free.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, TubeGenius Pro and its creators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Loss of profits or revenue</li>
            <li>Loss of data</li>
            <li>API costs incurred through third-party providers</li>
            <li>Any damages arising from your use of the service</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Service Modifications</h2>
          <p>
            We reserve the right to modify, suspend, or discontinue any part of the service at any time without prior notice. We shall not be liable to you or any third party for any modification, suspension, or discontinuation of the service.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Changes to Terms</h2>
          <p>
            We may update these Terms of Service from time to time. Continued use of the service after any changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Contact</h2>
          <p>
            If you have any questions about these Terms of Service, please contact us through our website.
          </p>
        </section>
      </div>
    </div>
  );
}
