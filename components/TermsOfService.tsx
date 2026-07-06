import React from 'react';
import { Scale, ArrowLeft } from 'lucide-react';

export default function TermsOfService() {
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

      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-slate-500 text-sm mb-10">Last updated: June 1, 2026</p>

        {[
          {
            title: '1. Acceptance of Terms',
            content: `By accessing or using CaseBuddy AI Law ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Service. These terms constitute a legally binding agreement between you and CaseBuddy AI Law.`
          },
          {
            title: '2. Description of Service',
            content: `CaseBuddy AI Law is an AI-powered legal assistance platform that provides case management tools, AI legal agents, document drafting assistance, call recording for evidence, and related services. The Service is not a law firm and does not provide legal advice. Our AI agents are informational tools only and do not constitute attorney-client relationships.`
          },
          {
            title: '3. Not Legal Advice',
            content: `IMPORTANT: CaseBuddy AI Law is a technology platform, not a law firm. No attorney-client relationship is formed by using this Service. The information provided by our AI agents is for informational purposes only and should not be relied upon as legal advice. Always consult a licensed attorney for legal advice specific to your situation.`
          },
          {
            title: '4. User Responsibilities',
            content: `You are responsible for: (a) maintaining the confidentiality of your account credentials; (b) all activities that occur under your account; (c) ensuring your use of the Service complies with all applicable laws, including call recording consent laws in your jurisdiction; (d) the accuracy of information you provide; and (e) obtaining all necessary consents before recording any communications.`
          },
          {
            title: '5. Call Recording',
            content: `By using our call recording feature, you represent and warrant that you have obtained all legally required consents from all parties to any recorded call. Call recording laws vary by jurisdiction. You are solely responsible for compliance with applicable wiretapping, eavesdropping, and recording laws. CaseBuddy AI Law assumes no liability for your failure to obtain proper consent.`
          },
          {
            title: '6. SMS Communications',
            content: `By providing your phone number and enrolling in our SMS program, you consent to receive automated text messages from CaseBuddy AI Law. Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for assistance. Opt-out requests will be processed within 24 hours.`
          },
          {
            title: '7. Acceptable Use',
            content: `You may not use the Service to: (a) violate any applicable law or regulation; (b) infringe upon the rights of others; (c) transmit harmful, harassing, or fraudulent content; (d) attempt to gain unauthorized access to any part of the Service; (e) use the Service for any unlawful purpose; or (f) engage in any activity that disrupts or interferes with the Service.`
          },
          {
            title: '8. Intellectual Property',
            content: `The Service, including all software, design, text, and content, is owned by CaseBuddy AI Law and protected by intellectual property laws. You retain ownership of content you upload. By uploading content, you grant us a limited license to process and store it solely to provide the Service.`
          },
          {
            title: '9. Limitation of Liability',
            content: `TO THE MAXIMUM EXTENT PERMITTED BY LAW, CASEBUDDY AI LAW SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. OUR TOTAL LIABILITY TO YOU FOR ANY CLAIMS ARISING FROM USE OF THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM.`
          },
          {
            title: '10. Disclaimer of Warranties',
            content: `THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT ANY INFORMATION PROVIDED BY OUR AI AGENTS IS ACCURATE, COMPLETE, OR CURRENT.`
          },
          {
            title: '11. Termination',
            content: `We reserve the right to suspend or terminate your account at our sole discretion, with or without notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties. You may terminate your account at any time by contacting support@casebuddy.live.`
          },
          {
            title: '12. Governing Law',
            content: `These Terms are governed by the laws of the State of Texas, without regard to conflict of law principles. Any disputes shall be resolved in the courts of Texas.`
          },
          {
            title: '13. Changes to Terms',
            content: `We may modify these Terms at any time. We will notify you of material changes via email or a notice on the platform. Your continued use of the Service after changes take effect constitutes acceptance of the revised Terms.`
          },
          {
            title: '14. Contact',
            content: `Questions about these Terms? Contact us at:\n\nCaseBuddy AI Law\nEmail: legal@casebuddy.live\nWebsite: https://casebuddy.live`
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
