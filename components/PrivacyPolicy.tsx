import React from 'react';
import { Scale, ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale size={24} className="text-amber-400" />
            <span className="font-bold text-lg">CaseBuddy AI Law</span>
          </div>
          <a href="/" className="flex items-center gap-1 text-slate-400 hover:text-white text-sm transition-colors">
            <ArrowLeft size={14} /> Back
          </a>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-16 prose prose-invert prose-slate max-w-none">
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-slate-500 text-sm mb-10">Last updated: June 1, 2026</p>

        {[
          {
            title: '1. Information We Collect',
            content: `We collect information you provide directly to us, including your name, email address, phone number, and any case-related information you upload or enter into the platform. We also collect usage data, device information, and communications you send to our AI agents (Maya, Sol, Lex, Rex, Sierra, and Doc).`
          },
          {
            title: '2. How We Use Your Information',
            content: `We use the information we collect to provide, maintain, and improve our services; respond to your inquiries through our AI agents; send you account notifications and updates; process transactions; and comply with legal obligations. We do not sell your personal information to third parties.`
          },
          {
            title: '3. SMS and Email Communications',
            content: `By enrolling on our platform, you consent to receive automated SMS messages and emails from CaseBuddy AI Law. These messages may include case updates, deadline reminders, agent replies, and account notifications. Standard message and data rates may apply. You may opt out of SMS at any time by replying STOP. You may opt out of emails by clicking the unsubscribe link or contacting us directly.`
          },
          {
            title: '4. Call Recording',
            content: `CaseBuddy AI Law offers optional call recording features for evidence documentation purposes. By using our call recording service, you acknowledge that calls may be recorded, transcribed, and stored. You are solely responsible for complying with all applicable federal, state, and local laws regarding call recording and consent in your jurisdiction. We do not initiate recordings without your explicit action.`
          },
          {
            title: '5. Data Storage and Security',
            content: `Your data is stored securely using Supabase (PostgreSQL) with row-level security enabled. We use industry-standard encryption for data in transit (TLS) and at rest. Access to your data is restricted to authorized personnel and our AI systems operating on your behalf.`
          },
          {
            title: '6. Third-Party Services',
            content: `We use the following third-party services to operate our platform: Supabase (database and authentication), SendGrid (email delivery), Twilio (SMS and call services), Google Gemini (AI language model), and Vercel (hosting). Each of these providers maintains their own privacy policies governing their use of your data.`
          },
          {
            title: '7. Data Retention',
            content: `We retain your personal information for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time by contacting us at privacy@casebuddy.live.`
          },
          {
            title: '8. Your Rights',
            content: `You have the right to access, correct, or delete your personal information. You may also request a copy of your data in a portable format. To exercise these rights, contact us at privacy@casebuddy.live. We will respond to requests within 30 days.`
          },
          {
            title: '9. Cookies',
            content: `We use session cookies solely for authentication purposes. We do not use tracking cookies or sell browsing data. You can disable cookies in your browser settings, though this may affect your ability to log in.`
          },
          {
            title: '10. Children\'s Privacy',
            content: `Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from minors. If you believe a minor has provided us with personal information, please contact us immediately.`
          },
          {
            title: '11. Changes to This Policy',
            content: `We may update this Privacy Policy from time to time. We will notify you of material changes by email or by posting a prominent notice on our website. Your continued use of the service after changes take effect constitutes acceptance of the updated policy.`
          },
          {
            title: '12. Contact Us',
            content: `If you have questions about this Privacy Policy, please contact us at:\n\nCaseBuddy AI Law\nEmail: privacy@casebuddy.live\nWebsite: https://casebuddy.live`
          },
        ].map((section, i) => (
          <div key={i} className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-3">{section.title}</h2>
            <p className="text-slate-400 leading-relaxed whitespace-pre-line">{section.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
